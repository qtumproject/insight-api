'use strict';

var bitcore = require('bitcore-lib');
var async = require('async');
var Common = require('./common');

function ContractsController(node) {
    this.node = node;
    this.common = new Common({log: this.node.log});
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