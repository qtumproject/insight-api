var Common = require('../lib/common');
var async = require('async');
var qtumcore = require('qtumcore-lib');
var TYPE = 'BLOCKS_MINED';

function AddressBlocksMinedService(options) {

    this.common = new Common({log: options.node.log});
    this.lastBlockRepository = options.lastBlockRepository;
    this.addressBlocksMinedRepository = options.addressBlocksMinedRepository;

    this.node = options.node;
    this.updateFromBlockHeight = 0;

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;
    this.lastCheckedBlock = 0;

}

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBlocksMinedService.prototype.start = function (next) {

    var self = this;

    this.common.log.info('[AddressBlocksMinedService] Start...');

    return async.waterfall([function (callback) {
        return self.lastBlockRepository.setLastBlockType(TYPE, 0, function(err) {

            if (err) {

                self.common.log.error('[AddressBlocksMinedService] setLastBlockType Error', err);

                return callback(err)
            }

            self.common.log.info('[AddressBlocksMinedService] LastBlockType set');

            return callback();

        });
    }, function (callback) {
        return self.lastBlockRepository.getLastBlockByType(TYPE, function(err, existingType) {

            if (err) {

                self.common.log.error('[AddressBlocksMinedService] getLastBlockByType Error', err);

                return callback(err)
            }

            self.lastCheckedBlock = existingType.last_block_number;
            self.common.log.info('[AddressBlocksMinedService] getLastBlockByType set', self.lastCheckedBlock);
            return callback();

        })
    },function (callback) {
        return self.node.getInfo(function (err, data) {

            if (err) {

                self.common.log.error('[AddressBlocksMinedService] getInfo Error', err);

                return callback(err);
            }

            if (data && data.blocks > self.lastTipHeight) {
                self.lastTipHeight = data.blocks;
            }

            self.common.log.info('[AddressBlocksMinedService] lastTipHeight = ', self.lastTipHeight);

            return callback();
        });
    }, function (callback) {
        return self._updateCaches(function (err) {
            return callback(err);
        });
    }], function (err) {

        if (err) {
            self.common.log.error('[AddressBlocksMinedService] start Error', err);
            return next(err);
        }

        self._rapidProtectedUpdateTip(self.lastTipHeight);

        self.node.services.qtumd.on('tip', self._rapidProtectedUpdateTip.bind(self));

        return next();

    });

};


AddressBlocksMinedService.prototype._updateCaches = function(next) {
    return next();
};

/**
 *
 * @param {number} height
 * @param {function} next
 * @return {*}
 * @private
 */
AddressBlocksMinedService.prototype._processLastBlocks = function(height, next) {

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
            self.common.log.error('[AddressBlocksMinedService] Update Error', err);
            return next(err);
        }

        return self._updateCaches(function (err) {
            return next(err);
        });

    });

};

/**
 *
 * @param {Number} height
 * @private
 */
AddressBlocksMinedService.prototype._rapidProtectedUpdateTip = function(height) {

    var self = this;

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }


    if (this.lastTipInProcess) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[AddressBlocksMinedService] start upd from ', self.lastCheckedBlock + 1 , ' to ', height);

    return this._processLastBlocks(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.common.log.info('[AddressBlocksMinedService] updated to ', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 */
AddressBlocksMinedService.prototype.processBlock = function (blockHeight, next) {

    var self = this;
    var block;
    var transaction;


    return async.waterfall([function (callback) {
        return self.node.services.qtumd.getJsonBlock(blockHeight, function (err, response) {

            if (err) {
                return callback(err);
            }

            if (!response) {
                return callback('Error getBlock');
            }

            block = response;

            return callback();

        });
    }, function (callback) {

        var txHash;

        switch (block.flags) {
            case qtumcore.Block.PROOF_OF_STAKE:
                txHash = block.tx[1];
                break;

            case qtumcore.Block.PROOF_OF_WORK:
                txHash = block.tx[0];
                break;
        }

        return self.node.getDetailedTransaction(txHash, function (err, trx) {

            if (err) {
                return callback(err);
            }

            transaction = trx;

            return callback();

        });

    }, function (callback) {

        var minedBy;

        switch (block.flags) {
            case qtumcore.Block.PROOF_OF_STAKE:
                minedBy = transaction.inputs[0].address;
                break;
            case qtumcore.Block.PROOF_OF_WORK:
                minedBy = transaction.outputs[0].address;
                break;
        }

        if (!minedBy) {
            return callback();
        }

        return self.addressBlocksMinedRepository.createOrUpdateAddress({address: minedBy}, function (err) {
            return callback(err);
        });

    }], function (err) {

        if (err) {
            return next(err);
        }

        return self.lastBlockRepository.updateOrAddLastBlock(block.height, TYPE, function (err) {
            return next(err);
        });

    });

};

module.exports = AddressBlocksMinedService;