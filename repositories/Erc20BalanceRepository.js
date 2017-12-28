const async = require('async');
const Erc20Balance = require('../models/Erc20Balance');

function Erc20BalanceRepository () {}


Erc20BalanceRepository.prototype.findBalanceByEthAddress = function (contractAddress, addressEth, next) {
    return Erc20Balance.findOne({contract_address: contractAddress, address_eth: addressEth}, function(err, row) {
        return next(err, row);
    });
};

/**
 *
 * @param {Function} next
 * @return {*}
 */
Erc20BalanceRepository.prototype.fetchContractsCountHolders = function (next) {

    return Erc20Balance.aggregate(
        [
            {
                $group : {
                    _id :  "$contract_address",
                    count: { $sum: 1 }
                }
            }

        ], function (err, items) {
            return next(err, items);
        });

};


Erc20BalanceRepository.prototype.createOrUpdateBalance = function (data, next) {
    return Erc20Balance.findOneAndUpdate({contract_address: data.contract_address, address_eth: data.address_eth}, data, {upsert: true, new: true}, function(err, row) {
        return next(err, row);
    });
};

Erc20BalanceRepository.prototype.removeBalance = function (data, next) {
    return Erc20Balance.remove({contract_address: data.contract_address, address_eth: data.address_eth}, function(err, row) {
        return next(err, row);
    });
};


Erc20BalanceRepository.prototype.getCountBalances = function (contractAddress, options, next) {

    var where = {contract_address: contractAddress};

    if (options && options.addresses && options.addresses.length) {
        where.$or = [{address : {$in: options.addresses}}];
    }

    return Erc20Balance.count(where, function(err, count) {
        return next(err, count);
    });
};


/**
 *
 * @param {String} contractAddress
 * @param {Object} options
 * @param {Number} options.limit
 * @param {Number} options.offset
 * @param {String} options.sort
 * @param {Function} next
 */
Erc20BalanceRepository.prototype.fetchBalances = function (contractAddress, options, next) {

    var queryOptions = {limit: options.limit, skip: options.offset};

    if (options.sort) {
        queryOptions.sort = {};
        var sortField = options.sort.field;
        switch (sortField) {
            case 'amount':
                queryOptions.sort['amount_hex'] = options.sort.direction === 'desc' ? -1 : 1;
                break;
        }
    } else {
        queryOptions.sort = {created_at: -1};
    }

    return Erc20Balance.find({contract_address: contractAddress}, {}, queryOptions, function(err, balances) {
        return next(err, balances);
    });

};

/**
 *
 * @param {String} address
 * @param {Function} next
 * @return {*}
 */
Erc20BalanceRepository.prototype.fetchBalancesByAddress = function (address, next) {
    return Erc20Balance.find({address: address}, {}, function(err, balances) {
        return next(err, balances);
    });
};

Erc20BalanceRepository.prototype.fetchBalanceByBaseAddressAndContract = function (address, contractBaseAddress, next) {
    return Erc20Balance.findOne({address: address, contract_address_base: contractBaseAddress}, {}, function(err, balances) {
        return next(err, balances);
    });
};

Erc20BalanceRepository.prototype.fetchBalanceByAddressAndContract = function (address, contractAddress, next) {
    return Erc20Balance.findOne({address: address, contract_address: contractAddress}, {}, function(err, balances) {
        return next(err, balances);
    });
};

module.exports = Erc20BalanceRepository;