'use strict';

var ResponseError = require('../components/errors/ResponseError');

function Common(options) {
  this.log = options.log;
}

Common.prototype.notReady = function (err, res, p) {
  res.status(503).send('Server not yet ready. Sync Percentage:' + p);
};

Common.prototype.handleErrors = function (err, res) {

  if (err instanceof ResponseError) {
      return res.status(err.code).send(err.message);
  }

  if (err) {
    if (err.code)  {
      res.status(400).send(err.message + '. Code:' + err.code);
    } else {
      this.log.error(err.stack);
      res.status(503).send(err.message);
    }
  } else {
    res.status(404).send('Not found');
  }
};

module.exports = Common;
