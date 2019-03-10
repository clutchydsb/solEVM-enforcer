import { getCodeWithStep, deployContract, deployCode, toBN } from './../helpers/utils';

import onChainFixtures from './../fixtures/onChain';
import Runtime from './../../utils/EthereumRuntimeAdapter';

const OP = require('./../../utils/constants');
const EthereumRuntime = artifacts.require('EthereumRuntime.sol');

contract('Runtime', function () {
  let rt;

  before(async () => {
    rt = new Runtime(await deployContract(EthereumRuntime));
  });

  describe('execute - stop - execute one step - compare', () => {
    onChainFixtures.forEach(fixture => {
      const { code, step, opcodeUnderTest } = getCodeWithStep(fixture);
      const data = fixture.data || '0x';
      let gasCost;

      it(opcodeUnderTest, async () => {
        const codeContract = await deployCode(code);
        // 1. export the state right before the target opcode (this supposed to be off-chain)
        const beforeState = await rt.execute(
          {
            code: codeContract.address,
            data,
            pc: 0,
            stepCount: step,
          }
        );
        // 2. export state right after the target opcode (this supposed to be off-chain)
        const afterState = await rt.execute(
          {
            code: codeContract.address,
            data,
            pc: 0,
            stepCount: step + 1,
          }
        );

        // 3. init with beforeState and execute just one step (target opcode) (this supposed to be on-chain)
        // console.log('Before', beforeState.stack);
        const onChainState = await rt.execute(
          {
            code: codeContract.address,
            data,
            pc: beforeState.pc,
            stepCount: 1,
            gasRemaining: beforeState.gas,
            stack: beforeState.stack,
            mem: beforeState.mem,
            accounts: beforeState.accounts,
            accountsCode: beforeState.accountsCode,
            logHash: beforeState.logHash,
          }
        );

        // 4. check that on-chain state is the same as off-chain
        // checking hashValue is enough to say that states are same
        assert.equal(onChainState.hashValue, afterState.hashValue, 'State Hash');

        // 5. run again with limited gas
        if (onChainState.errno > 0) {
          // skip test out of gas if already an error
          return;
        }
        gasCost = onChainState.gas;
        let limitedGas = toBN(OP.BLOCK_GAS_LIMIT) - gasCost - 1;
        if (limitedGas < 0) limitedGas = 0;
        console.log('Gas Cost', limitedGas);

        const oogState = await rt.execute(
          {
            code: codeContract.address,
            data,
            pc: 0,
            stepCount: 0,
            gasRemaining: limitedGas,
          }
        );
        assert.equal(oogState.errno, OP.ERROR_OUT_OF_GAS, 'Not out of gas');
      });
    });
  });

  describe('Special tests', () => {
    it('Stack overflow', async () => {
      let code = [];
      for (let i = 0; i < 1025; i++) {
        code.push(OP.PUSH1, '00');
      }
      let codeContract = await deployCode(code);
      const onChainState = await rt.execute(
        {
          code: codeContract.address,
          data: '0x',
          pc: 0,
          stepCount: 0,
        }
      );
      assert.equal(onChainState.errno, OP.ERROR_STACK_OVERFLOW);
    });
  });
});
