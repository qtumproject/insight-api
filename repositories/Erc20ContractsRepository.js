const async = require('async');
const Erc20Contracts = require('../models/Erc20Contracts');

function Erc20ContractsRepository () {}


/**
 *
 * @param {Function} next
 * @return {*}
 */
Erc20ContractsRepository.prototype.fetchAllContracts = function (next) {
    return Erc20Contracts.find({}, function(err, rows) {
        return next(err, rows);
    });
};

/**
 *
 * @param {Array} contractAddresses
 * @param {Function} next
 * @return {*}
 */
Erc20ContractsRepository.prototype.fetchContracts = function (contractAddresses, next) {
    return Erc20Contracts.find({contract_address: {$in: contractAddresses}}, function(err, row) {
        return next(err, row);
    });
};

Erc20ContractsRepository.prototype.fetchContractByBaseAddress = function (contractBaseAddress, next) {
    return Erc20Contracts.findOne({contract_address_base: contractBaseAddress}, function(err, row) {
        return next(err, row);
    });
};
Erc20ContractsRepository.prototype.fetchContract = function (contractAddress, next) {
    return Erc20Contracts.findOne({contract_address: contractAddress}, function(err, row) {
        return next(err, row);
    });
};

Erc20ContractsRepository.prototype.updateTotalSupply = function (contractAddress, totalSupply, next) {
    return Erc20Contracts.update({contract_address: contractAddress}, {total_supply: totalSupply}, function(err, row) {
        return next(err, row);
    });
};

Erc20ContractsRepository.prototype.createOrUpdateTx = function (data, next) {
    return Erc20Contracts.findOneAndUpdate({tx_hash: data.tx_hash, vout_idx: data.vout_idx}, data, {upsert: true, new: true}, function(err, row) {
        return next(err, row);
    });

};

Erc20ContractsRepository.prototype.findContract = function (query, options, next) {
    var where = {};

    where.$or = [{symbol : new RegExp(query, 'i')}, {name : new RegExp(query, 'i')}];

    if (query.length === 40) {
        where.$or.push({contract_address: query})
    }

    if (query.length === 34) {
        where.$or.push({contract_address_base: query})
    }

    return Erc20Contracts.find(where, {}, {limit: 100}, function(err, row) {
        return next(err, row);
    });
};

module.exports = Erc20ContractsRepository;