var util = require('util');
var EventEmitter = require('events').EventEmitter;
var request = require('request');
var _ = require('lodash');
var Common = require('../lib/common');

function MarketsService(options) {

    this.common = new Common({log: options.node.log});

    this.info = {
        price_usd: 0,
        price_btc: 0,
        market_cap_usd: 0
    };

    this._updateInfo();

    var self = this;

    setInterval(function () {
        self._updateInfo();
    }, 90000);

}

util.inherits(MarketsService, EventEmitter);

MarketsService.prototype._updateInfo = function() {
    var self = this;
    return request.get({
        url: 'https://api.coinmarketcap.com/v1/ticker/qtum',
        json: true
    }, function (err, response, body) {

        if (err) {
            return self.common.log.error('Coinmarketcap error', err);
        }

        if (response.statusCode != 200) {
            return self.common.log.error('Coinmarketcap error status code', response.statusCode);
        }

        if (body && _.isArray(body) && body.length) {
            var needToTrigger = false;

            ['price_usd', 'price_btc', 'market_cap_usd', 'available_supply'].forEach(function (param) {

                if (self.info[param] !== body[0][param]) {
                    self.info[param] = body[0][param];
                    needToTrigger = true;
                }

            });

            if (needToTrigger) {
                self.emit('updated', self.info);
            }

            return self.info;
        }

        return self.common.log.error('Coinmarketcap error body', body);

    });

};

MarketsService.prototype.getInfo = function(next) {
    return next(null, this.info);
};

module.exports = MarketsService;