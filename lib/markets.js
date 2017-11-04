'use strict';

function MarketsController(options) {
    this.marketsService = options.marketsService
}

MarketsController.prototype.getInfo = function(req, res) {
    return this.marketsService.getInfo(function (err, info) {
        return res.json(info);
    });
};

module.exports = MarketsController;