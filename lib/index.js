'use strict';

var Writable = require('stream').Writable;
var bodyParser = require('body-parser');
var compression = require('compression');
var BaseService = require('./service');
var inherits = require('util').inherits;
var BlockController = require('./blocks');
var StatisticsController = require('./statistics');
var TxController = require('./transactions');
var AddressController = require('./addresses');
var StatusController = require('./status');
var MessagesController = require('./messages');
var UtilsController = require('./utils');
var CurrencyController = require('./currency');
var ContractsController = require('./contracts');
var Erc20Watcher = require('./erc20-watcher');
var Erc20Controller = require('./erc20');
var MarketsController = require('./markets');
var Db = require('../components/Db');
var RateLimiter = require('./ratelimiter');
var morgan = require('morgan');
var bitcore = require('qtumcore-lib');
var _ = bitcore.deps._;
var $ = bitcore.util.preconditions;
var Transaction = bitcore.Transaction;
var EventEmitter = require('events').EventEmitter;
var async = require('async');
var SupplyHelper = require('../helpers/SupplyHelper');

var LastBlockRepository = require('../repositories/LastBlockRepository');
var AddressBalanceRepository = require('../repositories/AddressBalanceRepository');
var Erc20ContractsRepository = require('../repositories/Erc20ContractsRepository');
var Erc20TransferRepository = require('../repositories/Erc20TransferRepository');
var Erc20BalanceRepository = require('../repositories/Erc20BalanceRepository');
var StatisticDayRepository = require('../repositories/StatisticDayRepository');
var TotalStatisticRepository = require('../repositories/TotalStatisticRepository');
var AddressBlocksMinedRepository = require('../repositories/AddressBlocksMinedRepository');

var StatisticService = require('../services/StatisticService');
var TransactionService = require('../services/TransactionService');
var MarketsService = require('../services/MarketsService');
var AddressBalanceService = require('../services/AddressBalanceService');
var AllTokensListService = require('../services/AllTokensListService');
var AddressBlocksMinedService = require('../services/AddressBlocksMinedService');

/**
 * A service for Bitcore to enable HTTP routes to query information about the blockchain.
 *
 * @param {Object} options
 * @param {Boolean} options.enableCache - This will enable cache-control headers
 * @param {Number} options.cacheShortSeconds - The time to cache short lived cache responses.
 * @param {Number} options.cacheLongSeconds - The time to cache long lived cache responses.
 * @param {String} options.routePrefix - The URL route prefix
 */
var InsightAPI = function(options) {
  BaseService.call(this, options);

  var self = this;

  // in minutes
  this.currencyRefresh = options.currencyRefresh || CurrencyController.DEFAULT_CURRENCY_DELAY;

  this.subscriptions = {
    inv: [],
    qtum: []
  };

  if (!_.isUndefined(options.enableCache)) {
    $.checkArgument(_.isBoolean(options.enableCache));
    this.enableCache = options.enableCache;
  }
  this.cacheShortSeconds = options.cacheShortSeconds;
  this.cacheLongSeconds = options.cacheLongSeconds;

  this.rateLimiterOptions = options.rateLimiterOptions;
  this.disableRateLimiter = options.disableRateLimiter;
  this.dbConfig = options.db;
  this.erc20Config = options.erc20;

  this.enableContractsApiLogs = typeof options.enableContractsApiLogs === 'undefined' ? true : options.enableContractsApiLogs;
  this.enableApiLogs = typeof options.enableApiLogs === 'undefined' ? true : options.enableApiLogs;

  this.blockSummaryCacheSize = options.blockSummaryCacheSize || BlockController.DEFAULT_BLOCKSUMMARY_CACHE_SIZE;
  this.blockCacheSize = options.blockCacheSize || BlockController.DEFAULT_BLOCK_CACHE_SIZE;

  if (!_.isUndefined(options.routePrefix)) {
    this.routePrefix = options.routePrefix;
  } else {
    this.routePrefix = this.name;
  }

    this.statisticDayRepository = new StatisticDayRepository();
    this.lastBlockRepository = new LastBlockRepository();
    this.erc20ContractsRepository = new Erc20ContractsRepository();
    this.erc20TransferRepository = new Erc20TransferRepository();
    this.erc20BalanceRepository = new Erc20BalanceRepository();
    this.addressBalanceRepository = new AddressBalanceRepository();
    this.totalStatisticRepository = new TotalStatisticRepository();
    this.addressBlocksMinedRepository = new AddressBlocksMinedRepository();

    this.statisticService = new StatisticService({node: this.node, statisticDayRepository: this.statisticDayRepository, lastBlockRepository: this.lastBlockRepository, totalStatisticRepository: this.totalStatisticRepository});

    this.transactionService = new TransactionService({node: this.node, erc20TransferRepository: this.erc20TransferRepository});

    this.txController = new TxController({node: this.node, transactionService: this.transactionService});

    //Block routes
    var blockOptions = {
        node: this.node,
        blockSummaryCacheSize: this.blockSummaryCacheSize,
        blockCacheSize: this.blockCacheSize,
        transactionService: this.transactionService
    };

    this.blocksController = new BlockController(blockOptions);

    /**
     * TODO::exception
     */
    if (this.dbConfig) {

        this.db = new Db(this.node, this.dbConfig);

        this.db.connect(function (err) {

            if (err) {
                return self.node.log.error('db.connect error');
            }

            if (self.erc20Config) {
                self.erc20Watcher = new Erc20Watcher(self.node, {
                    updateFromBlockHeight: self.erc20Config.updateFromBlockHeight,
                    lastBlockRepository: self.lastBlockRepository,
                    erc20ContractsRepository: self.erc20ContractsRepository,
                    erc20TransferRepository: self.erc20TransferRepository,
                    erc20BalanceRepository: self.erc20BalanceRepository
                });
            } else {
                self.node.log.warn('erc20Config is empty');
            }

        });

    } else {
        self.node.log.warn('dbConfig is empty');
    }

    this.allTokensListService = new AllTokensListService({node: this.node, erc20ContractsRepository: self.erc20ContractsRepository, erc20BalanceRepository: self.erc20BalanceRepository})
    this.marketsService = new MarketsService({node: this.node});
    this.addressBalanceService = new AddressBalanceService({marketsService: this.marketsService, lastBlockRepository: self.lastBlockRepository, addressBalanceRepository: self.addressBalanceRepository, node: this.node});
    this.addressBlocksMinedService = new AddressBlocksMinedService({node: this.node, addressBlocksMinedRepository: self.addressBlocksMinedRepository, lastBlockRepository: self.lastBlockRepository});

    this.statisticsController = new StatisticsController({
        node: this.node,
        addressBalanceService: this.addressBalanceService,
        statisticService: this.statisticService,
        addressBlocksMinedRepository: this.addressBlocksMinedRepository
    });
    this.statusController = new StatusController(this.node);
    this.marketsController = new MarketsController({marketsService: this.marketsService});

};

InsightAPI.dependencies = ['qtumd', 'web'];

inherits(InsightAPI, BaseService);

InsightAPI.prototype.cache = function(maxAge) {
  var self = this;
  return function(req, res, next) {
    if (self.enableCache) {
      res.header('Cache-Control', 'public, max-age=' + maxAge);
    }
    next();
  };
};

InsightAPI.prototype.cacheShort = function() {
  var seconds = this.cacheShortSeconds || 30; // thirty seconds
  return this.cache(seconds);
};

InsightAPI.prototype.cacheLong = function() {
  var seconds = this.cacheLongSeconds || 86400; // one day
  return this.cache(seconds);
};

InsightAPI.prototype.getRoutePrefix = function() {
  return this.routePrefix;
};

InsightAPI.prototype.start = function(callback) {
  var self = this;

  this.node.services.qtumd.on('tx', this.transactionEventHandler.bind(this));
  this.node.services.qtumd.on('block', this.blockEventHandler.bind(this));

  this.marketsService.on('updated', function (info) {
    for (var i = 0; i < self.subscriptions.inv.length; i++) {
        self.subscriptions.inv[i].emit('markets_info', info);
    }
  });

  this.statisticService.on('updated', function (updInfo) {

      if (!self.subscriptions.inv.length) {
          return false;
      }

      var dataFlow = {
          info: null,
          stakingInfo: null,
          supply: null
      };

      return async.waterfall([function (callback) {
          return self.statusController.getInfo(function (err, info) {
              if (err) {
                  self.node.log.error('getInfo', err);
                  return callback(err);
              }

              dataFlow.info = info;

              return callback();
          });
      }, function (callback) {
          return self.statusController.getStakingInfo(function (err, stakingInfo) {

              if (err) {
                  self.node.log.error('getStakingInfo', err);
                  return callback(err);
              }

              dataFlow.stakingInfo = stakingInfo;

              return callback();
          });
      }], function (err) {

          if (err) {
              return false;
          }

          if (!self.subscriptions.inv.length) {
              return false;
          }

          dataFlow.supply = SupplyHelper.getTotalSupplyByHeight(updInfo.height).toString(10);

          for (var i = 0; i < self.subscriptions.inv.length; i++) {
              self.subscriptions.inv[i].emit('info', dataFlow);
          }

      });

  });

  return async.waterfall([function (callback) {
      return self.addressBalanceService.start(function (err) {
          return callback(err);
      });
  }, function (callback) {
      return self.statisticService.start(function (err) {
          return callback(err);
      })
  }, function (callback) {
      return self.addressBlocksMinedService.start(function (err) {
         return callback(err);
      });
  }], function (err) {

      if (err) {
          self.node.log.error('START ERROR', err);
      }

      setImmediate(callback);
  });
};

InsightAPI.prototype.createLogInfoStream = function() {
  var self = this;

  function Log(options) {
    Writable.call(this, options);
  }
  inherits(Log, Writable);

  Log.prototype._write = function (chunk, enc, callback) {
    self.node.log.info(chunk.slice(0, chunk.length - 1)); // remove new line and pass to logger
    callback();
  };
  var stream = new Log();

  return stream;
};

InsightAPI.prototype.getRemoteAddress = function(req) {
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  return req.socket.remoteAddress;
};

InsightAPI.prototype._getRateLimiter = function() {
  var rateLimiterOptions = _.isUndefined(this.rateLimiterOptions) ? {} : _.clone(this.rateLimiterOptions);
  rateLimiterOptions.node = this.node;
  var limiter = new RateLimiter(rateLimiterOptions);
  return limiter;
};

InsightAPI.prototype.setupRoutes = function(app) {

  var self = this;

  //Enable rate limiter
  // if (!this.disableRateLimiter) {
  //   var limiter = this._getRateLimiter();
  //   app.use(limiter.middleware());
  // }

  //Setup logging
  if (this.enableApiLogs) {
	  morgan.token('remote-forward-addr', function(req){
		return self.getRemoteAddress(req);
	  });
	  var logFormat = ':remote-forward-addr ":method :url" :status :res[content-length] :response-time ":user-agent" ';
	  var logStream = this.createLogInfoStream();
	  app.use(morgan(logFormat, {
		  stream: logStream,
		  skip: function(req, res) {
			 return !self.enableContractsApiLogs && req.url.includes('/contracts')
		  }
		}));
  }

  //Enable compression
  app.use(compression());

  //Enable urlencoded data
  app.use(bodyParser.urlencoded({extended: true}));

  app.use(require("body-parser").json())
  app.use(require("cors")())

  //Enable CORS
  // app.use(function(req, res, next) {

  //   res.header('Access-Control-Allow-Origin', '*');
  //   res.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, OPTIONS');
  //   res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Content-Length, Cache-Control, cf-connecting-ip');

  //   var method = req.method && req.method.toUpperCase && req.method.toUpperCase();

  //   if (method === 'OPTIONS') {
  //     res.statusCode = 204;
  //     res.end();
  //   } else {
  //     next();
  //   }
  // });

    /**
     * Tokens
     * @type {Erc20Controller}
     */
  var erc20Controller = new Erc20Controller(this.node, {
        erc20ContractsRepository: self.erc20ContractsRepository,
        erc20TransferRepository: self.erc20TransferRepository,
        erc20BalanceRepository: self.erc20BalanceRepository,
        allTokensListService: self.allTokensListService
    });

  app.get('/tokens/:contractBaseAddress/addresses/:accountAddress/balance', this.cacheShort(), erc20Controller.getAccountBalance.bind(erc20Controller));
  app.get('/tokens/:contractBaseAddress/transactions', this.cacheShort(), erc20Controller.getContractTransactions.bind(erc20Controller));
  app.get('/tokens/:contractBaseAddress/total-supply', this.cacheShort(), erc20Controller.getTotalSupply.bind(erc20Controller));

  app.get('/tokens', this.cacheShort(), erc20Controller.getAllTokens.bind(erc20Controller));

  app.get('/erc20/search', this.cacheShort(), erc20Controller.findQrc20Contracts.bind(erc20Controller));
  app.get('/erc20/balances', this.cacheShort(), erc20Controller.findBalancesByTransferAddress.bind(erc20Controller));
  app.get('/qrc20/:contractAddress', this.cacheShort(), erc20Controller.getInfo.bind(erc20Controller));
  app.get('/erc20/:contractAddress', this.cacheShort(), erc20Controller.getInfo.bind(erc20Controller));//TODO:: rm / DEPRECATED
  app.get('/erc20/:contractAddress/transfers', this.cacheShort(), erc20Controller.getTransfers.bind(erc20Controller));
  app.get('/erc20/:contractAddress/balances', this.cacheShort(), erc20Controller.getBalances.bind(erc20Controller));
  app.param('contractAddress', erc20Controller.convertContractAddress.bind(erc20Controller));

  app.get('/supply', this.cacheShort(), this.statisticsController.totalSupply.bind(this.statisticsController));
  app.get('/statistics/total-supply', this.cacheShort(), this.statisticsController.totalSupply.bind(this.statisticsController));
  app.get('/statistics/circulating-supply', this.cacheShort(), this.statisticsController.circulatingSupply.bind(this.statisticsController));
  app.get('/statistics/supply', this.cacheShort(), this.statisticsController.supply.bind(this.statisticsController));
  app.get('/statistics/fees', this.cacheShort(), this.statisticsController.fees.bind(this.statisticsController));
  app.get('/statistics/transactions', this.cacheShort(), this.statisticsController.transactions.bind(this.statisticsController));
  app.get('/statistics/outputs', this.cacheShort(), this.statisticsController.outputs.bind(this.statisticsController));
  app.get('/statistics/difficulty', this.cacheShort(), this.statisticsController.difficulty.bind(this.statisticsController));
  app.get('/statistics/stake', this.cacheShort(), this.statisticsController.stake.bind(this.statisticsController));
  app.get('/statistics/total', this.cacheShort(), this.statisticsController.total.bind(this.statisticsController));
  app.get('/statistics/balance-intervals', this.cacheShort(), this.statisticsController.balanceIntervals.bind(this.statisticsController));
  app.get('/statistics/richer-than', this.cacheShort(), this.statisticsController.getRicherThan.bind(this.statisticsController));
  app.get('/statistics/richest-addresses-list', this.cacheShort(), this.statisticsController.getRichestAddressesList.bind(this.statisticsController));

    /**
     * Blocks routes
     * @type {BlockController}
     */

  var blocks = this.blocksController;
  app.get('/blocks', this.cacheShort(), blocks.list.bind(blocks));


  app.get('/block/:blockHash', this.cacheShort(), blocks.checkBlockHash.bind(blocks), blocks.show.bind(blocks));
  app.param('blockHash', blocks.block.bind(blocks));

  app.get('/rawblock/:blockHash', this.cacheLong(), blocks.checkBlockHash.bind(blocks), blocks.showRaw.bind(blocks));
  app.param('blockHash', blocks.rawBlock.bind(blocks));

  app.get('/block-index/:height', this.cacheShort(), blocks.blockIndex.bind(blocks));
  app.param('height', blocks.blockIndex.bind(blocks));

    /**
     * Transaction routes
     * @type {TxController}
     */
  var transactions = new TxController({node: this.node, transactionService: this.transactionService});
  app.get('/tx/:txid', this.cacheShort(), transactions.show.bind(transactions));
  app.param('txid', transactions.transaction.bind(transactions));
  app.get('/txs', this.cacheShort(), transactions.list.bind(transactions));
  app.get('/txs/:txid/receipt', this.cacheShort(), transactions.getTransactionReceipt.bind(transactions));
  app.post('/tx/send', transactions.send.bind(transactions));

  // Raw Routes
  app.get('/rawtx/:txid', this.cacheLong(), transactions.showRaw.bind(transactions));
  app.param('txid', transactions.rawTransaction.bind(transactions));

  // Address routes
  var addresses = new AddressController({node: this.node, txController: transactions, transactionService: this.transactionService });

  app.get('/addr/:addr', this.cacheShort(), addresses.checkAddr.bind(addresses), addresses.show.bind(addresses));
  app.get('/addr/:addr/utxo', this.cacheShort(), addresses.checkAddr.bind(addresses), addresses.utxo.bind(addresses));
  app.get('/addrs/:addrs/utxo', this.cacheShort(), addresses.checkAddrs.bind(addresses), addresses.multiutxo.bind(addresses));
  app.get('/addrs/:addrs/unspent', this.cacheShort(), addresses.checkAddrs.bind(addresses), addresses.utxoWithoutMempool.bind(addresses));
  app.post('/addrs/utxo', this.cacheShort(), addresses.checkAddrs.bind(addresses), addresses.multiutxo.bind(addresses));
  app.get('/addrs/:addrs/txs', this.cacheShort(), addresses.checkAddrs.bind(addresses), addresses.multitxs.bind(addresses));
  app.post('/addrs/txs', this.cacheShort(), addresses.checkAddrs.bind(addresses), addresses.multitxs.bind(addresses));
  app.post('/addrs', this.cacheShort(), addresses.createaddress.bind(addresses));


  app.get('/addrs/:addrs/balance', this.cacheShort(), addresses.checkAddrs.bind(addresses), addresses.balancesum.bind(addresses));

    /**
     * Address property routes
     */

  app.get('/addr/:addr/balance', this.cacheShort(), addresses.checkAddr.bind(addresses), addresses.balance.bind(addresses));
  app.get('/addr/:addr/totalReceived', this.cacheShort(), addresses.checkAddr.bind(addresses), addresses.totalReceived.bind(addresses));
  app.get('/addr/:addr/totalSent', this.cacheShort(), addresses.checkAddr.bind(addresses), addresses.totalSent.bind(addresses));
  app.get('/addr/:addr/unconfirmedBalance', this.cacheShort(), addresses.checkAddr.bind(addresses), addresses.unconfirmedBalance.bind(addresses));


  app.get('/status', this.cacheShort(), this.statusController.show.bind(this.statusController));
  app.get('/sync', this.cacheShort(), this.statusController.sync.bind(this.statusController));
  app.get('/peer', this.cacheShort(), this.statusController.peer.bind(this.statusController));
  app.get('/version', this.cacheShort(), this.statusController.version.bind(this.statusController));
  app.get('/dgpinfo', this.cacheShort(), this.statusController.getDgpInfo.bind(this.statusController));


    /**
     * Address routes
     * @type {MessagesController}
     */
  var messages = new MessagesController(this.node);
  app.get('/messages/verify', messages.verify.bind(messages));
  app.post('/messages/verify', messages.verify.bind(messages));

  // Utils route
  var utils = new UtilsController(this.node);
  app.get('/utils/estimatefee', utils.estimateFee.bind(utils));
  app.get('/utils/minestimatefee', utils.minEstimateFee.bind(utils));

  // Currency
  var currency = new CurrencyController({
    node: this.node,
    currencyRefresh: this.currencyRefresh
  });
  app.get('/currency', currency.index.bind(currency));

    /**
     * Contracts
     */
  var contracts = new ContractsController(this.node);
  app.post('/contracts/call', contracts.postCallContract.bind(contracts));
  app.get('/contracts/:contractaddress/hash/:contracthash/call', contracts.callContract.bind(contracts));
  app.get('/contracts/:contractaddress/info', contracts.getAccountInfo.bind(contracts));
  app.get('/contracts/:contractaddress/get-erc20-info', contracts.getErc20Info.bind(contracts));

  app.get('/markets/info', this.marketsController.getInfo.bind(this.marketsController));

  // Not Found
  app.use(function(req, res) {
    res.status(404).jsonp({
      status: 404,
      url: req.originalUrl,
      error: 'Not found'
    });
  });



};

InsightAPI.prototype.getPublishEvents = function() {
  return [
    {
      name: 'inv',
      scope: this,
      subscribe: function (emitter) {
          this.subscribe(emitter, 'inv');
      }.bind(this),
      unsubscribe: function (emitter) {
          this.unsubscribe(emitter, 'inv');
      },
      extraEvents: ['tx', 'block', 'info', 'markets_info']
    },
    {
        name: 'qtum',
        scope: this,
        subscribe: function (emitter) {
            this.subscribe(emitter, 'qtum');
        }.bind(this),
        unsubscribe: function (emitter) {
            this.unsubscribe(emitter, 'qtum');
        },
        extraEvents: ['qtum/tx', 'qtum/block']
    }
  ];
};

InsightAPI.prototype.blockEventHandler = function(hashBuffer) {

  // Notify inv subscribers
  for (var i = 0; i < this.subscriptions.inv.length; i++) {
    this.subscriptions.inv[i].emit('block', hashBuffer.toString('hex'));
    this.subscriptions.inv[i].emit('test', 'test');

  }

  var self = this;

  if (self.subscriptions.qtum.length) {

      this.blocksController.getBlockByHash(hashBuffer.toString('hex'), function (err, block) {

          if (err) {
              return err;
          }

          if (!block.tx) {
              return false;
          }

          async.mapSeries(block.tx, function(txid, next) {
              self.transactionService.getDetailedTransaction(txid, function(err, transaction) {
                  if (err) {
                      return next(err);
                  }

                  self.txController.transformTransaction(transaction, function(err, transformedTransaction) {
                      if (err) {
                          return next(err);
                      }

                      next(null, transformedTransaction);
                  });


              });
          }, function(err, transformed) {
              if(err) {
                  return ;
              }

              // Notify qtum subscribers
              for (var i = 0; i < self.subscriptions.qtum.length; i++) {
                  self.subscriptions.qtum[i].emit('qtum/block', {
                      block: block,
                      transactions: transformed ? transformed : []
                  });
              }
          });

      });

  }

};
InsightAPI.prototype.transactionEventHandler = function(txBuffer) {

  if (this.subscriptions.inv.length || this.subscriptions.qtum.length) {

      var tx = new Transaction().fromBuffer(txBuffer);

      if (this.subscriptions.inv.length) {

          var result = this.txController.transformInvTransaction(tx);

          // Notify inv subscribers
          for (var i = 0; i < this.subscriptions.inv.length; i++) {
              this.subscriptions.inv[i].emit('tx', result);
          }

      }

      if (this.subscriptions.qtum.length) {

          var transformedTrx = this.txController.transformQtumTransaction(tx);

          for (var i = 0; i < this.subscriptions.qtum.length; i++) {
              this.subscriptions.qtum[i].emit('qtum/tx', transformedTrx);
          }

      }

  }




};

InsightAPI.prototype.subscribe = function(emitter, room) {
  $.checkArgument(emitter instanceof EventEmitter, 'First argument is expected to be an EventEmitter');

  var emitters = this.subscriptions[room];
  var index = emitters.indexOf(emitter);
  if(index === -1) {
    emitters.push(emitter);
  }
};

InsightAPI.prototype.unsubscribe = function(emitter, room) {
  $.checkArgument(emitter instanceof EventEmitter, 'First argument is expected to be an EventEmitter');

  var emitters = this.subscriptions[room];
  var index = emitters.indexOf(emitter);
  if(index > -1) {
    emitters.splice(index, 1);
  }
};

module.exports = InsightAPI;
