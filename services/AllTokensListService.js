var util = require('util');
var EventEmitter = require('events').EventEmitter;
var async = require('async');
var Common = require('../lib/common');

function AllTokensListService(options) {

    this.common = new Common({log: options.node.log});
    this.node = options.node;

    this.erc20ContractsRepository = options.erc20ContractsRepository;
    this.erc20BalanceRepository = options.erc20BalanceRepository;

    this.cacheInfo = {
        count: 0,
        items: []
    };

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;

    this._rapidProtectedUpdateTip(this.node.services.qtumd.height);
    this.node.services.qtumd.on('tip', this._rapidProtectedUpdateTip.bind(this));

}

util.inherits(AllTokensListService, EventEmitter);

/**
 *
 * @param {Number} height
 * @return {*}
 * @private
 */
AllTokensListService.prototype._rapidProtectedUpdateTip = function(height) {

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }

    if (this.lastTipInProcess) {
        return false;
    }

    this.lastTipInProcess = true;

    this.common.log.info('[ALL TOKENS LIST Service] Update height to', height);

    var self = this,
        dataFlow = {
            contracts: [],
            allContracts: [],
            countHolders: []
        };

    return async.waterfall([function (callback) {
        return self.erc20ContractsRepository.fetchAllContracts(function (err, rows) {

            if (err) {
                return callback(err);
            }

            dataFlow.allContracts = rows;

            return callback();

        });
    }, function (callback) {
        return self.erc20BalanceRepository.fetchContractsCountHolders(function (err, rows) {

            if (err) {
                return callback(err);
            }

            dataFlow.countHolders = rows;

            return callback();
        });
    }, function (callback) {

        var countHoldersHash = {};

        dataFlow.countHolders.forEach(function (item) {
            countHoldersHash[item._id] = item.count;
        });

        dataFlow.allContracts.forEach(function (contract) {
            dataFlow.contracts.push({
                count_holders: countHoldersHash[contract.contract_address] ? countHoldersHash[contract.contract_address] : 0,
                tx_hash: contract.tx_hash,
                vout_idx: contract.vout_idx,
                updated_at: contract.updated_at,
                block_height: contract.block_height,
                contract_address: contract.contract_address,
                contract_address_base: contract.contract_address_base,
                decimals: contract.decimals,
                name: contract.name,
                symbol: contract.symbol,
                total_supply: contract.total_supply,
                version: contract.version,
                exception: contract.exception,
                created_at: contract.created_at,
                description: contract.description ? contract.description : null
            });
        });

        return callback();

    }], function (err) {

        if (err) {
            return self.common.log.error('[ALL TOKENS LIST Service] ERROR ', height);
        }

        self.cacheInfo = {
            count: dataFlow.contracts.length,
            items: dataFlow.contracts
        };

        self.lastTipInProcess = false;

        if (self.lastTipHeight !== height && self.lastTipHeight > height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

        return self.common.log.info('[ALL TOKENS LIST Service] Updated to', height);

    });

};

/**
 *
 * @param {Function} next
 * @return {*}
 */
AllTokensListService.prototype.getList = function(next) {
    return next(null, this.cacheInfo);
};

module.exports = AllTokensListService;