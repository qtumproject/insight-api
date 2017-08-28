'use strict';

var bitcore = require('bitcore-lib');
var async = require('async');
var _ = bitcore.deps._;
var Common = require('./common');
var ResponseError = require('../components/errors/ResponseError');

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

module.exports = Erc20Controller;