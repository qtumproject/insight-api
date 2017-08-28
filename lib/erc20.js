'use strict';

var bitcore = require('bitcore-lib');
var async = require('async');
var _ = bitcore.deps._;
var Common = require('./common');
var ResponseError = require('../components/errors/ResponseError');
var MAX_TRANSFERS_LIMIT = 20;
var MAX_BALANCES_LIMIT = 20;

function Erc20Controller(node, opts) {
    this.node = node;
    this.common = new Common({log: this.node.log});
    this.erc20ContractsRepository = opts.erc20ContractsRepository;
    this.erc20TransferRepository = opts.erc20TransferRepository;
    this.erc20BalanceRepository = opts.erc20BalanceRepository;
}

Erc20Controller.prototype.getInfo = function(req, res) {

    var self = this,
        contractAddress = req.params.contractAddress,
        returnData = {
            contract: null,
            countTransfers: 0,
            countHolders: 0
        };

    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.fetchContract(contractAddress, function (err, result) {

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
        return self.erc20TransferRepository.getCountTransfers(contractAddress, function (err, count) {

            if (err) {
                return callback(err);
            }

            returnData.countTransfers = count;

            return callback();

        });
    }, function (callback) {

        return self.erc20BalanceRepository.getCountBalances(contractAddress, function (err, count) {

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
            total_supply: returnData.contract.total_supply,
            decimals: returnData.contract.decimals,
            name: returnData.contract.name,
            symbol: returnData.contract.symbol,
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
        queryOptions = self._formatQueryOptions(limit, offset),
        dataFlow = {
            countBalances: 0,
            balances: []
        };


    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.fetchContract(contractAddress, function (err, contract) {

            if (err) {
                return callback(err);
            }

            if (!contract) {
                return callback(new ResponseError('Not Found', 404));
            }

            return callback();

        });
    }, function (callback) {

        return self.erc20BalanceRepository.getCountBalances(contractAddress, function (err, count) {

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

        return self.erc20BalanceRepository.fetchBalances(contractAddress, queryOptions, function (err, balances) {

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

Erc20Controller.prototype.getTransfers = function(req, res) {

    var self = this,
        contractAddress = req.params.contractAddress,
        offset = req.query.offset,
        limit = req.query.limit,
        queryOptions = self._formatQueryOptions(limit, offset),
        dataFlow = {
            countTransfers: 0,
            transfers: []
        };

    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.fetchContract(contractAddress, function (err, contract) {

            if (err) {
                return callback(err);
            }

            if (!contract) {
                return callback(new ResponseError('Not Found', 404));
            }

            return callback();

        });
    }, function (callback) {

        return self.erc20TransferRepository.getCountTransfers(contractAddress, function (err, count) {

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

        return self.erc20TransferRepository.fetchTransfers(contractAddress, queryOptions, function (err, transfers) {

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

Erc20Controller.prototype._formatQueryOptions = function(limit, offset) {

    limit = parseInt(limit, 10);
    offset = parseInt(offset, 10);

    if (isNaN(limit)) {
        limit = MAX_TRANSFERS_LIMIT;
    }

    if (isNaN(offset)) {
        offset = 0
    }

    limit = Math.abs(limit);
    offset = Math.abs(offset);

    if (limit > MAX_TRANSFERS_LIMIT) {
        limit = MAX_TRANSFERS_LIMIT;
    }

    return {
        offset: offset,
        limit: limit
    };
};


Erc20Controller.prototype.convertContractAddress = function(req, res, next) {

    if (_.isString(req.params.contractAddress)) {
        req.params.contractAddress = req.params.contractAddress.toLowerCase();
        req.params.contractAddress = req.params.contractAddress.replace(/^0x/, '');
    }

    return next();
};

module.exports = Erc20Controller;