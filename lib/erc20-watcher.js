'use strict';
var bitcore = require('qtumcore-lib');
var async = require('async');
var Common = require('./common');
var ContractsHelper = require('../helpers/ContractsHelper');
var COIN_TYPE = 'ERC20_WATCHER';
var ERC20_ZERO_TOPIC_HASH = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
var SolidityCoder = require("web3/lib/solidity/coder.js");
var functionHashes = require("../data/contracts/erc20/FunctionHashes.json");
var BigNumber = require('bignumber.js');

function Erc20Watcher(node, options) {

    this.node = node;
    this.common = new Common({log: this.node.log});

    this.updateFromBlockHeight = options.updateFromBlockHeight;

    this.lastBlockRepository = options.lastBlockRepository;
    this.erc20ContractsRepository = options.erc20ContractsRepository;
    this.erc20TransferRepository = options.erc20TransferRepository;
    this.erc20BalanceRepository = options.erc20BalanceRepository;

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;
    this.lastCheckedBlock = 0;

    this.start();

}

/**
 *
 * @return {*}
 */
Erc20Watcher.prototype.start = function () {

    var self = this;

    this.common.log.info('[ERC20WATCHER] Start...');

    return async.waterfall([function (callback) {
        return self.lastBlockRepository.setLastBlockType(COIN_TYPE, self.updateFromBlockHeight, function(err) {

            if (err) {

                self.common.log.error('[ERC20WATCHER] setLastBlockType Error', err);

                return callback(err)
            }

            self.common.log.info('[ERC20WATCHER] LastBlockType set');

            return callback();

        });
    }, function (callback) {
        return self.lastBlockRepository.getLastBlockByType(COIN_TYPE, function(err, existingType) {

            if (err) {

                self.common.log.error('[ERC20WATCHER] getLastBlockByType Error', err);

                return callback(err)
            }

            self.lastCheckedBlock = existingType.last_block_number;
            self.common.log.info('[ERC20WATCHER] getLastBlockByType set', self.lastCheckedBlock);
            return callback();

        })
    },function (callback) {
        return self.node.getInfo(function (err, data) {

            if (err) {

                self.common.log.error('[ERC20WATCHER] getInfo Error', err);

                return callback(err);
            }

            if (data && data.blocks > self.lastTipHeight) {
                self.lastTipHeight = data.blocks;
            }

            self.common.log.info('[ERC20WATCHER] lastTipHeight = ', self.lastTipHeight);

            return callback();
        });
    }], function (err) {

        if (err) {
            return self.common.log.error('[ERC20WATCHER] start Error', err);
        }

        self._rapidProtectedUpdateTip(self.lastTipHeight);
        self.node.services.qtumd.on('tip', self._rapidProtectedUpdateTip.bind(self));

    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 */
Erc20Watcher.prototype.processBlock = function (blockHeight, next) {

    var self = this;

    return self.node.getBlockOverview(blockHeight, function (err, block) {

        if (err) {
            return next(err);
        }

        return async.eachSeries(block.txids, function (txHash, callback) {

            return self.node.getJsonRawTransaction(txHash, function (err, transaction) {

                var voutReceiptIterator = 0;
                var txTime = transaction.time;

                transaction.vout.forEach(function (vout) {
                    if (vout.scriptPubKey && ['call', 'create'].indexOf(vout.scriptPubKey.type) !== -1) {
                        vout.receiptIdx = voutReceiptIterator;
                        voutReceiptIterator++;
                    }
                });

                var createVouts = transaction.vout.filter(function (vout) {
                    return vout.scriptPubKey && vout.scriptPubKey.type === 'create' && ContractsHelper.isErc20Contract(vout.scriptPubKey.hex);
                });

                var callVouts = transaction.vout.filter(function (vout) {
                    return vout.scriptPubKey && vout.scriptPubKey.type === 'call';
                });

                var receipt = null;

                return async.waterfall([function (callback) {
                    return self.node.getTransactionReceipt(txHash, function (err, response) {

                        if (err) {
                            return callback(err);
                        }

                        receipt = response;

                        return callback();
                    });
                }, function (callback) {

                    /**
                     * create process
                     */

                    if (!receipt.length) {
                        return callback();
                    }

                    if (!createVouts.length) {
                        return async.setImmediate(function() {
                            return callback();
                        });
                    }

                    return self.processCreate(blockHeight, txHash, receipt, createVouts, function (err) {
                        return callback(err);
                    });

                }, function (callback) {
                    /**
                     * call process
                     */

                    if (!receipt.length) {
                        return callback();
                    }

                    if (!callVouts.length) {
                        return async.setImmediate(function() {
                            return callback();
                        });
                    }

                    return self.processCall(blockHeight, txHash, txTime, receipt, callVouts, function (err) {
                        return callback(err);
                    });

                }], function (err) {
                    return callback(err);
                });

            });

        }, function (err) {

            if (err) {
                return next(err);
            }

            return self.lastBlockRepository.updateOrAddLastBlock(block.height, COIN_TYPE, function (err) {
                return next(err);
            });

        });

    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {String} txHash
 * @param {Object} receipt
 * @param {Object} callVouts
 * @param {Function} callback
 * @return {*}
 */
Erc20Watcher.prototype.processCall = function (blockHeight, txHash, txTime, receipt, callVouts, callback) {

    var self = this;

    return async.waterfall([function (callback) {

        if (!receipt.length) {
            return callback();
        }

        return async.eachSeries(callVouts, function (callVout, callback) {

            return async.waterfall([function (callback) {

                if (!receipt || !receipt[callVout.receiptIdx] || !receipt[callVout.receiptIdx].log.length){
                    return callback();
                }

                return self.erc20ContractsRepository.fetchContract(receipt[callVout.receiptIdx].contractAddress, function (err, erc20Contract) {

                    if (erc20Contract) {

                        self.common.log.info('[ERC20WATCHER] erc20Contract', erc20Contract, receipt);

                        return self.node.callContract(receipt[callVout.receiptIdx].contractAddress, functionHashes['totalSupply()'], {}, function(err, data) {

                            if (err) {
                                return callback(err);
                            }

                            var total_supply = 0;

                            try {
                                var totalSupplyArr = SolidityCoder.decodeParams(["uint256"], data.executionResult.output);
                                total_supply = totalSupplyArr && totalSupplyArr.length ? totalSupplyArr[0].toString(10) : 0;
                            } catch (e) {}

                            if (erc20Contract.total_supply === total_supply) {
                                return callback();
                            }

                            return self.erc20ContractsRepository.updateTotalSupply(receipt[callVout.receiptIdx].contractAddress, total_supply, function (err) {
                                return callback(err);
                            });

                        });

                    } else {
                        return callback();
                    }
                });


            }], function (err) {
                return callback(err);
            });

        }, function (err) {
            return callback(err);
        });

    }, function (callback) {

        if (!receipt || !receipt.length) {
            return callback();
        }

        return self.processReceipt(receipt, txHash, txTime, function (err) {
            return callback(err);
        });

    }], function (err) {
        return callback(err);
    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {String} txHash
 * @param {Object} receipt
 * @param {Object} createVouts
 * @param {Function} callback
 * @return {*}
 */
Erc20Watcher.prototype.processCreate = function (blockHeight, txHash, receipt, createVouts, callback) {

    var self = this;

    return async.waterfall([function (callback) {

        return async.eachOfSeries(createVouts, function (vout, voutCreateIdx, callback) {
            if (vout.scriptPubKey && vout.scriptPubKey.type === 'create' && ContractsHelper.isErc20Contract(vout.scriptPubKey.hex)) {

                var voutReceipt = receipt[vout.receiptIdx],
                    scriptHex = vout.scriptPubKey.hex,
                    contractAddress = ContractsHelper.getContractAddress(txHash, vout.n),
                    erc20Data = {
                        block_height: blockHeight,
                        tx_hash: txHash,
                        vout_idx: vout.n,
                        contract_address: contractAddress,
                        decimals: 0,
                        name: '',
                        symbol: '',
                        total_supply: 0,
                        version: '',
                        exception: false
                    };

                if (voutReceipt.contractAddress === '0000000000000000000000000000000000000000') {//contract doesn't create
                    erc20Data.exception = true;
                    return self.erc20ContractsRepository.createOrUpdateTx(erc20Data, function (err, row) {

                        if (err) {
                            self.common.log.error('[ERC20WATCHER] error createOrUpdateTx', err);
                            return callback(err);
                        }

                        self.common.log.info('[ERC20WATCHER] createOrUpdateTx', row);
                        return callback();
                    });
                }

                return async.waterfall([function (callback) {
                    return self.node.callContract(contractAddress, functionHashes['totalSupply()'], {}, function(err, data) {

                        if (err) {
                            return callback(err);
                        }

                        try {
                            var totalSupplyArr = SolidityCoder.decodeParams(["uint256"], data.executionResult.output);
                            erc20Data['total_supply'] = totalSupplyArr && totalSupplyArr.length ? totalSupplyArr[0].toString(10) : 0;
                        } catch (e) {}

                        return callback();
                    });
                }, function (callback) {

                    if (!ContractsHelper.isContainDecimals(scriptHex)) {
                        return callback();
                    }

                    return self.node.callContract(contractAddress, functionHashes['decimals()'], {}, function(err, data) {

                        if (err) {
                            return callback(err);
                        }

                        try {
                            var decimalsArr = SolidityCoder.decodeParams(["uint8"], data.executionResult.output);
                            erc20Data['decimals'] = decimalsArr && decimalsArr.length ? decimalsArr[0].toNumber() : 0;
                        } catch (e) {}

                        return callback();
                    });

                }, function (callback) {

                    if (!ContractsHelper.isContainName(scriptHex)) {
                        return callback();
                    }

                    return self.node.callContract(contractAddress, functionHashes['name()'], {}, function(err, data) {
                        if (err) {
                            return callback(err);
                        }
                        try {
                            var nameArr = SolidityCoder.decodeParams(["string"], data.executionResult.output);
                            erc20Data['name'] = nameArr && nameArr.length ? nameArr[0] : null;
                        } catch (e) {}
                        return callback();
                    });
                }, function (callback) {

                    if (!ContractsHelper.isContainVersion(scriptHex)) {
                        return callback();
                    }

                    return self.node.callContract(contractAddress, functionHashes['version()'], {}, function(err, data) {

                        if (err) {
                            return callback(err);
                        }

                        try {
                            var versionArr = SolidityCoder.decodeParams(["string"], data.executionResult.output);
                            erc20Data['version'] = versionArr && versionArr.length ? versionArr[0] : null;
                        } catch (e) {}

                        return callback();

                    });

                }, function (callback) {

                    if (!ContractsHelper.isContainSymbol(scriptHex)) {
                        return callback();
                    }

                    return self.node.callContract(contractAddress, functionHashes['symbol()'], {}, function(err, data) {

                        if (err) {
                            return callback(err);
                        }

                        try {
                            var symbolArr = SolidityCoder.decodeParams(["string"], data.executionResult.output);
                            erc20Data['symbol'] = symbolArr && symbolArr.length ? symbolArr[0] : null;
                        } catch (e) {}

                        return callback();
                    });
                }], function (err) {

                    if (err) {
                        self.common.log.error('[ERC20WATCHER] error processTx', err);
                        return callback(err);
                    }

                    return self.erc20ContractsRepository.createOrUpdateTx(erc20Data, function (err, row) {

                        if (err) {
                            self.common.log.error('[ERC20WATCHER] error createOrUpdateTx', err);
                            return callback(err);
                        }

                        self.common.log.info('[ERC20WATCHER] createOrUpdateTx', row);

                        return callback();
                    });

                });
            } else {
                return async.setImmediate(function() {
                    return callback();
                });
            }
        }, function (err) {
            return callback(err);
        });

    }], function (err) {
        return callback(err);
    });

};
/**
 *
 * @param {Object} receipt
 * @param {String} txHash
 * @param {Number} txTime
 * @param {Function} callback
 * @return {*}
 */
Erc20Watcher.prototype.processReceipt = function(receipt, txHash, txTime, callback) {

    var self = this;

    return async.eachSeries(receipt, function (receiptItem, callback) {

        if (!receiptItem || !receiptItem.log || !receiptItem.log.length) {
            return async.setImmediate(function() {
                return callback();
            });
        }

        return self.erc20ContractsRepository.fetchContract(receiptItem.contractAddress, function (err, erc20Contract) {

            if (err) {
                return callback(err);
            }

            if (!erc20Contract) {
                return callback();
            }

            return async.eachOfSeries(receiptItem.log, function (logItem, logIdx, callback) {

                if (logItem && logItem.topics && logItem.topics.length === 3 && logItem.topics[0] === ERC20_ZERO_TOPIC_HASH) {

                    var addressFrom = logItem.topics[1],
                        addressTo = logItem.topics[2],
                        erc20TransferData = {
                            tx_hash: txHash,
                            tx_time: txTime,
                            log_idx: logIdx,
                            contract_address: receiptItem.contractAddress,
                            from_eth: null,
                            to_eth: null,
                            from: null,
                            to: null,
                            value: 0
                        };

                    try {
                        var addressFromArr = SolidityCoder.decodeParams(["address"], addressFrom);
                        erc20TransferData.from_eth = addressFromArr && addressFromArr.length ? addressFromArr[0] : null;
                        erc20TransferData.from = ContractsHelper.getBitAddressFromContractAddress(erc20TransferData.from_eth, self.node.network.pubkeyhash.toString(16));
                    } catch (e) {}

                    try {
                        var addressToArr = SolidityCoder.decodeParams(["address"], addressTo);
                        erc20TransferData.to_eth = addressToArr && addressToArr.length ? addressToArr[0] : null;
                        erc20TransferData.to = ContractsHelper.getBitAddressFromContractAddress(erc20TransferData.to_eth, self.node.network.pubkeyhash.toString(16));
                    } catch (e) {}

                    try {
                        var valueToArr = SolidityCoder.decodeParams(["uint"], logItem.data);
                        erc20TransferData.value = valueToArr && valueToArr.length ? valueToArr[0].toString(10) : 0;
                    } catch (e) {}

                    return async.waterfall([function (callback) {
                        return self.erc20TransferRepository.createOrUpdateTx(erc20TransferData, function (err) {
                            return callback(err);
                        });
                    }, function (callback) {

                        if (!erc20TransferData.from || !erc20TransferData.to) {
                            return callback();
                        }

                        return self.updateBalances(erc20TransferData, function (err) {
                            return callback(err);
                        })

                    }], function (err) {
                        return callback(err);
                    });

                } else {
                    return callback();
                }

            }, function (err) {
                return callback(err);
            });

        });

    }, function (err) {
        return callback(err);
    });

};

/**
 *
 * @param {Object} erc20TransferData
 * @param {Function} callback
 */
Erc20Watcher.prototype.updateBalances = function (erc20TransferData, callback) {

    var self = this,
        dataFlow = {
            to: null,
            from: null
        };

    return async.waterfall([function (callback) {
        return self.erc20BalanceRepository.findBalanceByEthAddress(erc20TransferData.from_eth, function (err, result) {

            if (err) {
                return callback(err);
            }

            var from;

            if (!result) {
                from = {
                    contract_address: erc20TransferData.contract_address,
                    address_eth: erc20TransferData.from_eth,
                    address: erc20TransferData.from,
                    amount: 0
                };
            } else {
                from = {
                    contract_address: result.contract_address,
                    address_eth: result.address_eth,
                    address: result.address,
                    amount: result.amount
                };
            }

            dataFlow.from = from;

            return callback();

        });
    }, function (callback) {
        return self.erc20BalanceRepository.findBalanceByEthAddress(erc20TransferData.to_eth, function (err, result) {

            if (err) {
                return callback(err);
            }

            var to;

            if (!result) {
                to = {
                    contract_address: erc20TransferData.contract_address,
                    address_eth: erc20TransferData.to_eth,
                    address: erc20TransferData.to,
                    amount: 0
                };
            } else {
                to = {
                    contract_address: result.contract_address,
                    address_eth: result.address_eth,
                    address: result.address,
                    amount: result.amount
                };
            }

            dataFlow.to = to;

            return callback();

        });
    }, function (callback) {

        return async.waterfall([function (callback) {
            return self.getAddressBalance(erc20TransferData.contract_address, dataFlow.from.address_eth, function (err, balance) {

                if (err) {
                    return callback(err);
                }

                dataFlow.from.amount = balance;

                return callback();

            });
        }, function (callback) {
            return self.getAddressBalance(erc20TransferData.contract_address, dataFlow.to.address_eth, function (err, balance) {

                if (err) {
                    return callback(err);
                }

                dataFlow.to.amount = balance;

                return callback();
            })
        }], function (err) {
            return callback(err);
        });

    }, function (callback) {

        return async.waterfall([function (callback) {

            return self.checkBalance(dataFlow.from, function (err) {
                return callback(err);
            });

        }, function (callback) {

            return self.checkBalance(dataFlow.to, function (err) {
                return callback(err);
            });

        }], function (err) {
            return callback(err);
        });

    }], function (err) {
        return callback(err);
    });

};

/**
 *
 * @param {Object} balanceItem
 * @param {Function} callback
 */
Erc20Watcher.prototype.checkBalance = function(balanceItem, callback) {
    var self = this;
    var amountBN = new BigNumber(balanceItem.amount);

    if (amountBN.gt(0)) {
        return self.erc20BalanceRepository.createOrUpdateBalance(balanceItem, function (err) {
            return callback(err);
        });
    } else {
        return self.erc20BalanceRepository.removeBalance(balanceItem, function (err) {
            return callback(err);
        });
    }
};

/**
 *
 * @param {String} contractAddress
 * @param {String} address
 * @param {Function} callback
 * @return {*}
 */
Erc20Watcher.prototype.getAddressBalance = function(contractAddress, address, callback) {
    var self = this;
    try {
        var payload = SolidityCoder.encodeParam('address', address);

        return self.node.callContract(contractAddress, functionHashes['balanceOf(address)'] + payload, {}, function(err, data) {

            if (err) {
                return callback(err);
            }

            if (data && data.executionResult) {

                try {
                    var decodedBalance = SolidityCoder.decodeParam("uint256", data.executionResult.output);
                    return callback(null, decodedBalance.toString(10));

                } catch (e) {}

            }


            return callback(null, 0);


        });
    } catch (e) {
        return async.setImmediate(function() {
            return callback(null, 0);
        });
    }

};
/**
 *
 * @param {number} height
 * @param {function} next
 * @return {*}
 * @private
 */
Erc20Watcher.prototype._getLastBlocks = function(height, next) {

    var self = this,
        blocks = [];

    for (var i = self.lastCheckedBlock + 1; i <= height; i++) {
        blocks.push(i);
    }

    return async.eachSeries(blocks, function (blockHeight, callback) {
        return self.processBlock(blockHeight, function (err) {
            if (err) {
                return callback(err);
            }

            self.lastCheckedBlock = blockHeight;

            return callback();

        });
    }, function (err) {

        if (err) {
            self.common.log.error('[ERC20WATCHER] Update Error', err);
            return next(err);
        }

        return next();
    });
};

/**
 *
 * @param {number} height
 * @returns {boolean}
 * @private
 */
Erc20Watcher.prototype._rapidProtectedUpdateTip = function(height) {

    var self = this;

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }


    if (this.lastTipInProcess) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[ERC20WATCHER] start upd from ', self.lastCheckedBlock + 1 , ' to ', height);

    return this._getLastBlocks(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.common.log.info('[ERC20WATCHER] updated to ', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};

module.exports = Erc20Watcher;