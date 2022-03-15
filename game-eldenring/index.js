const path = require('path');
const { log, util } = require('vortex-api');

const EXEC_PATH = path.join('Game', 'eldenring.exe');

class EldenRing {
  constructor(context) {
    this.context = context;
    this.id = 'eldenring';
    this.name = 'ELDEN RING';
    this.mergeMods = true;
    this.logo = 'gameart.jpg';
    this.details = {
      steamAppId: 1245620,
    };
    this.requiredFiles = [EXEC_PATH];
  }

  queryPath() {
	return util.steam.findByAppId(['1245620',])
      .then(game => {
        if (game.appid === '1245620') {
          this.details = {
            steamAppId: game.appid,
          };
        }
        return game.gamePath;
      });
  }

  queryModPath() {
    return './Game';
  }

  executable() {
    return EXEC_PATH;;
  }
}

function main(context) {
  context.registerGame(new EldenRing(context));
  return true;
}

module.exports = {
  default: main,
};
