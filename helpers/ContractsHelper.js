var bitcore = require('qtumcore-lib');
var functionHashes = require("../data/contracts/erc20/FunctionHashes.json");
var CONTRACT_CALL = 194;
var CONTRACT_CREATE = 193;


module.exports = {
    getContractAddress: function (txId, num) {
        var reverseTxId = txId.match(/.{2}/g).reverse().join(""),
            buf = new bitcore.deps.Buffer(4);

        buf.writeUInt32LE(num, 0);

        var nHex = buf.toString('hex'),
            addr = reverseTxId + nHex,
            bufferAddress = bitcore.crypto.Hash.sha256ripemd160(new bitcore.deps.Buffer(addr, 'hex'));

        return bufferAddress.toString('hex');
    },
    isErc20Contract: function (scriptHex) {
        var hashes = [
            functionHashes['allowance(address,address)'],
            functionHashes['approve(address,uint256)'],
            functionHashes['balanceOf(address)'],
            functionHashes['totalSupply()'],
            functionHashes['transfer(address,uint256)'],
            functionHashes['transferFrom(address,address,uint256)'],
            functionHashes['Transfer(address,address,uint256)'],
            // functionHashes['Approval(address,address,uint256)']//TODO::uncomment
        ];

        if (scriptHex) {
            for(var i = 0; i < hashes.length; i++) {
                if (scriptHex.indexOf(hashes[i]) === -1) {
                    return false;
                }
            }
            return true;

        }

        return false;

    },
    isContainDecimals: function(scriptHex) {

        if (scriptHex) {

            if (scriptHex.indexOf(functionHashes['decimals()']) !== -1) {
                return true;
            }

        }

        return false;
    },
    isContainName: function (scriptHex) {
        if (scriptHex) {
            if (scriptHex.indexOf(functionHashes['name()']) !== -1) {
                return true;
            }
        }
        return false;
    },
    isContainSymbol: function (scriptHex) {

        if (scriptHex) {

            if (scriptHex.indexOf(functionHashes['symbol()']) !== -1) {
                return true;
            }

        }

        return false;
    },
    isContainVersion: function (scriptHex) {

        if (scriptHex) {

            if (scriptHex.indexOf(functionHashes['version()']) !== -1) {
                return true;
            }

        }

        return false;
    },
    isContractCreate: function (script) {
        return this.isScriptEqualOpCodes(script, [CONTRACT_CREATE]);
    },
    isContractCall: function (script) {
        return this.isScriptEqualOpCodes(script, [CONTRACT_CALL]);
    },
    isScriptEqualOpCodes: function(script, opCodes) {

        if (script && script.chunks && script.chunks.length) {

            for(var k=0; k < script.chunks.length; k++) {

                if (script.chunks[k] && script.chunks[k]['opcodenum'] && opCodes.indexOf(script.chunks[k]['opcodenum']) !== -1) {
                    return true;
                }

            }

        }

        return false;
    },
    getBitAddressFromContractAddress: function (contractAddress, networkId) {
        try {
            if (/^0x/.test(contractAddress)) {
                contractAddress = contractAddress.slice(contractAddress.length - 40, contractAddress.length);
            }

            var checksum = bitcore.crypto.Hash.sha256sha256(new bitcore.deps.Buffer(networkId + contractAddress, 'hex')),
                hexBitAddress = networkId + contractAddress + checksum.toString('hex').slice(0, 8);

            return bitcore.encoding.Base58.encode(new bitcore.deps.Buffer(hexBitAddress, 'hex'));
        } catch (e) {

            return null;
        }
    }

};