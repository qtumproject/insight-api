'use strict';

var bitcore = require('qtumcore-lib');
var async = require('async');
var _ = bitcore.deps._;
var Common = require('./common');
var ResponseError = require('../components/errors/ResponseError');
var MAX_ITEMS_LIMIT = 20;

/**
 *
 * @param {Object} node
 * @param {Object} opts
 * @constructor
 */
function Erc20Controller(node, opts) {
    this.node = node;
    this.common = new Common({log: this.node.log});
    this.erc20ContractsRepository = opts.erc20ContractsRepository;
    this.erc20TransferRepository = opts.erc20TransferRepository;
    this.erc20BalanceRepository = opts.erc20BalanceRepository;
}

/**
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Object} res.params
 * @param {String} res.params.contractAddress
 * @param {Object} res.query
 * @param {String} res.query.address
 * @return {*}
 */
Erc20Controller.prototype.getInfo = function(req, res) {

    var self = this,
        contractAddress = req.params.contractAddress,
        address = req.query.address,
        addresses = [],
        returnData = {
            contract: null,
            countTransfers: 0,
            countHolders: 0
        };

    if (address) {
        addresses.push(address);
    }

    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.findBySymbolOrContractAddress(contractAddress, function (err, result) {

            if (err) {
                return callback(err);
            }

            if (!result) {
                return callback(new ResponseError('Not Found', 404));
            }

            returnData.contract = result;

            return callback();
        });
    }, function (callback) {
        return self.erc20TransferRepository.getCountTransfers(returnData.contract.contract_address, {addresses: addresses}, function (err, count) {

            if (err) {
                return callback(err);
            }

            returnData.countTransfers = count;

            return callback();

        });
    }, function (callback) {

        return self.erc20BalanceRepository.getCountBalances(returnData.contract.contract_address, {addresses: addresses}, function (err, count) {

            if (err) {
                return callback(err);
            }

            returnData.countHolders = count;

            return callback();

        });
    }], function (err) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp({
            contract_address: returnData.contract.contract_address,
            total_supply: returnData.contract.total_supply,
            decimals: returnData.contract.decimals,
            name: returnData.contract.name,
            symbol: returnData.contract.symbol,
            version: returnData.contract.version,
            transfers_count: returnData.countTransfers,
            holders_count: returnData.countHolders
        });

    });

};


Erc20Controller.prototype.getBalances = function(req, res) {
    var self = this,
        contractAddress = req.params.contractAddress,
        offset = req.query.offset,
        limit = req.query.limit,
        queryOptions = self._formatQueryOptions(limit, offset, []),
        dataFlow = {
            contract: null,
            countBalances: 0,
            balances: []
        };


    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.findBySymbolOrContractAddress(contractAddress, function (err, contract) {

            if (err) {
                return callback(err);
            }

            if (!contract) {
                return callback(new ResponseError('Not Found', 404));
            }

            dataFlow.contract = contract;

            return callback();

        });
    }, function (callback) {

        return self.erc20BalanceRepository.getCountBalances(dataFlow.contract.contract_address, queryOptions, function (err, count) {

            if (err) {
                return callback(err);
            }

            dataFlow.countBalances = count;

            return callback();

        });

    }, function (callback) {

        if (!dataFlow.countBalances) {
            return callback();
        }

        return self.erc20BalanceRepository.fetchBalances(dataFlow.contract.contract_address, queryOptions, function (err, balances) {

            if (err) {
                return callback(err);
            }

            dataFlow.balances = balances;

            return callback();

        });

    }], function (err) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp({
            limit: queryOptions.limit,
            offset: queryOptions.offset,
            count: dataFlow.countBalances,
            items: dataFlow.balances.map(function (balance) {
                return {
                    contract_address: balance.contract_address,
                    address: balance.address,
                    address_eth: balance.address_eth,
                    amount: balance.amount
                };
            })
        });

    });

};


/**
 *
 * @param {Object} req
 * @param {Object} req.query
 * @param {String} req.query.balanceAddress
 * @param {String?} req.query.contractSymbol
 * @param {Object} res
 * @return {*}
 */
Erc20Controller.prototype.findBalancesByTransferAddress = function(req, res) {

    var self = this,
        balanceAddress = req.query.balanceAddress,
        contractSymbol = req.query.contractSymbol,
        dataFlow = {
            uniqueContracts: [],
            contracts: [],
            balances: []
        };

    if (contractSymbol) {

        var symbolDataFlow = {};

        return async.waterfall([function (callback) {
            return self.erc20ContractsRepository.findBySymbol(contractSymbol, function (err, result) {

                if (err) {
                    return callback(err);
                }

                if (!result) {
                    return callback(new ResponseError('Not Found', 404));
                }

                symbolDataFlow.contract = result;

                return callback();
            });
        }, function (callback) {

            var contract = symbolDataFlow.contract;

            return self.erc20BalanceRepository.fetchBalancesByAddressAndContract(balanceAddress, contract.contract_address, function (err, balance) {

                if (err) {
                    return callback(err);
                }

                if (!balance) {
                    return callback(new ResponseError('Not Found', 404));
                }

                return callback(null, {
                    amount: balance.amount,
                    address: balance.address,
                    address_eth: balance.address_eth,
                    contract: contract
                });

            });

        }], function (err, result) {

            if (err) {
                return self.common.handleErrors(err, res);
            }

            return res.jsonp(result);

        });

    }

    return async.waterfall([function (callback) {

        return self.erc20BalanceRepository.fetchBalancesByAddress(balanceAddress, function (err, balances) {

            if (err) {
                return callback(err);
            }

            if (!balances.length) {
                return callback();
            }

            dataFlow.balances = balances;

            return callback();

        });

    }, function (callback) {


        if (!dataFlow.balances.length) {
            return callback();
        }

        var contractsAddresses = [];

        dataFlow.balances.forEach(function (balance) {
            contractsAddresses.push(balance.contract_address);
        });

        return self.erc20ContractsRepository.fetchContracts(contractsAddresses, function (err, results) {

            if (err) {
                return callback(err);
            }

            dataFlow.contracts = results;

            return callback();
        });

    }], function (err) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        var contractsHash = {};

        dataFlow.contracts.forEach(function (contract) {
            contractsHash[contract.contract_address] = contract;
        });

        var result = [];

        dataFlow.balances.forEach(function (balance) {
            result.push({
                amount: balance.amount,
                address: balance.address,
                address_eth: balance.address_eth,
                contract: contractsHash[balance.contract_address]
            });
        });

        return res.jsonp(result);
    });

};

Erc20Controller.prototype.getTransfers = function(req, res) {

    var self = this,
        contractAddress = req.params.contractAddress,
        offset = req.query.offset,
        limit = req.query.limit,
        addresses = req.query.addresses,
        queryOptions = self._formatQueryOptions(limit, offset, addresses),
        dataFlow = {
            contract: null,
            countTransfers: 0,
            transfers: []
        };

    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.findBySymbolOrContractAddress(contractAddress, function (err, contract) {

            if (err) {
                return callback(err);
            }

            if (!contract) {
                return callback(new ResponseError('Not Found', 404));
            }

            dataFlow.contract = contract;

            return callback();

        });
    }, function (callback) {

        return self.erc20TransferRepository.getCountTransfers(dataFlow.contract.contract_address, {addresses: queryOptions.addresses}, function (err, count) {

            if (err) {
                return callback(err);
            }

            dataFlow.countTransfers = count;

            return callback();

        });

    }, function (callback) {

        if (!dataFlow.countTransfers) {
            return callback();
        }

        return self.erc20TransferRepository.fetchTransfers(dataFlow.contract.contract_address, queryOptions, function (err, transfers) {

            if (err) {
                return callback(err);
            }

            dataFlow.transfers = transfers;

            return callback();

        });

    }], function (err) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp({
            limit: queryOptions.limit,
            offset: queryOptions.offset,
            count: dataFlow.countTransfers,
            items: dataFlow.transfers.map(function (transfer) {
                return {
                    contract_address: transfer.contract_address,
                    tx_hash: transfer.tx_hash,
                    tx_time: transfer.tx_time,
                    from: transfer.from,
                    from_eth: transfer.from_eth,
                    to: transfer.to,
                    to_eth: transfer.to_eth,
                    value: transfer.value
                };
            })
        });

    });


};

Erc20Controller.prototype._formatQueryOptions = function(limit, offset, queryAddresses) {

    limit = parseInt(limit, 10);
    offset = parseInt(offset, 10);

    var addresses = [];

    if (isNaN(limit)) {
        limit = MAX_ITEMS_LIMIT;
    }

    if (isNaN(offset)) {
        offset = 0
    }

    limit = Math.abs(limit);
    offset = Math.abs(offset);

    if (limit > MAX_ITEMS_LIMIT) {
        limit = MAX_ITEMS_LIMIT;
    }

    if (queryAddresses && _.isArray(queryAddresses) && queryAddresses.length) {
        queryAddresses.forEach(function (address) {
            if (_.isString(address)) {
                addresses.push(address);
            }
        });
    } else if (queryAddresses && _.isString(queryAddresses)) {
        addresses.push(queryAddresses);
    }

    return {
        offset: offset,
        limit: limit,
        addresses: addresses
    };
};


Erc20Controller.prototype.convertContractAddress = function(req, res, next) {

    if (_.isString(req.params.contractAddress)) {
        req.params.contractAddress = req.params.contractAddress.replace(/^0x/, '');
    }

    return next();
};

module.exports = Erc20Controller;