const async = require('async');
const Erc20Transfer = require('../models/Erc20Transfer');

function Erc20TransferRepository () {}

Erc20TransferRepository.prototype.getCountTransfers = function (contractAddress, next) {
    return Erc20Transfer.count({contract_address: contractAddress}, function(err, count) {
        return next(err, count);
    });
};

Erc20TransferRepository.prototype.createOrUpdateTx = function (data, next) {
    return Erc20Transfer.findOneAndUpdate({tx_hash: data.tx_hash, log_idx: data.log_idx, contract_address: data.contract_address}, data, {upsert: true, new: true}, function(err, row) {
        return next(err, row);
    });

};

module.exports = Erc20TransferRepository;