'use strict';
var SolidityCoder = require("web3/lib/solidity/coder.js");
var bitcore = require('qtumcore-lib');
var async = require('async');
var Common = require('./common');

function ContractsController(node) {
    this.node = node;
    this.common = new Common({log: this.node.log});
    this.contractsInfo = Object.create(null);
}

ContractsController.prototype.callContract = function(req, res) {

    var self = this,
        address = req.params.contractaddress,
        hash = req.params.contracthash;

    this.node.callContract(address, hash, function(err, data) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        res.jsonp(data);

    });
};
ContractsController.prototype.getErc20Info = function(req, res) {

    var self = this,
        address = req.params.contractaddress,
        //ERC20 decimals hash, symbol hash
        hashes = {
            symbol: '95d89b41',
            decimals: '313ce567'
        },
        hashResult = {};

    if (this.contractsInfo[address]) {
        return res.jsonp(this.contractsInfo[address]);
    }

    return async.eachOfSeries(hashes, function (hash, keyName, callback) {

        return self.node.callContract(address, hash, function(err, data) {

            if (err) {
                return callback(err);
            }

            switch (keyName) {
                case 'symbol':
                    var symbolArr = SolidityCoder.decodeParams(["string"], data.executionResult.output);
                    hashResult[keyName] = symbolArr && symbolArr.length ? symbolArr[0] : null;
                    break;
                case 'decimals':
                    var decArr = SolidityCoder.decodeParams(["uint8"], data.executionResult.output);
                    hashResult[keyName] = decArr && decArr.length ? decArr[0] : null;
                    break;
            }

            return callback();
        });

    }, function (err) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        self.contractsInfo[address] = hashResult;

        return res.jsonp(hashResult);

    });

};

ContractsController.prototype.getAccountInfo = function(req, res) {

    var self = this,
        address = req.params.contractaddress;

    this.node.getAccountInfo(address, function(err, data) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        res.jsonp(data);

    });
};

module.exports = ContractsController;