import * as LevelHelper from '../../../src/controller/level-helper';
const assert = require('assert');

describe('level-helper', function () {
  describe('updateFragPTSDTS', function () {
    let details;
    let frag;
    beforeEach(function () {
      details = {
        fragments: []
      };
      frag = {
        sn: 0
      };
    });

    describe('PTS/DTS updating', function () {
      function checkFragProperties (frag, startPTS, endPTS, startDTS, endDTS, maxStartPTS) {
        assert.strictEqual(frag.start, startPTS);
        assert.strictEqual(frag.startPTS, startPTS);
        assert.strictEqual(frag.maxStartPTS, maxStartPTS);
        assert.strictEqual(frag.endPTS, endPTS);
        assert.strictEqual(frag.startDTS, startDTS);
        assert.strictEqual(frag.endDTS, endDTS);
        assert.strictEqual(frag.duration, endPTS - startPTS);
      }

      it('updates frag properties based on the provided PTS/DTS', function () {
        const startPTS = 2;
        const endPTS = 12;
        const startDTS = 1;
        const endDTS = 11;

        LevelHelper.updateFragPTSDTS(null, frag, startPTS, endPTS, startDTS, endDTS);
        checkFragProperties(frag, 2, 12, 1, 11, 2);
      });

      it('updates frag properties based on the intersection of existing frag PTS/DTS and provided frag PTS/DTS', function () {
        const startPTS = 2;
        const endPTS = 12;
        const startDTS = 1;
        const endDTS = 11;

        frag.startPTS = 3;
        frag.endPTS = 13;
        frag.startDTS = 2;
        frag.endDTS = 12;

        LevelHelper.updateFragPTSDTS(null, frag, startPTS, endPTS, startDTS, endDTS);
        checkFragProperties(frag, 3, 12, 2, 11, 3);
        assert.strictEqual(frag.deltaPTS, 1);

        frag.startPTS = 0;
        frag.endPTS = 10;
        frag.startDTS = 0;
        frag.endDTS = 10;

        LevelHelper.updateFragPTSDTS(null, frag, startPTS, endPTS, startDTS, endDTS);
        checkFragProperties(frag, 2, 10, 1, 10, 2);
        assert.strictEqual(frag.deltaPTS, 2);
      });

      it('chooses the min start and max end if the a/v PTS values do not intersect', function () {
        const startPTS = 14;
        const endPTS = 24;
        const startDTS = 1;
        const endDTS = 11;

        frag.startPTS = 3;
        frag.endPTS = 13;
        frag.startDTS = 2;
        frag.endDTS = 12;

        LevelHelper.updateFragPTSDTS(null, frag, startPTS, endPTS, startDTS, endDTS);
        checkFragProperties(frag, 3, 24, 1, 12, 14);
        assert.strictEqual(frag.deltaPTS, 11);
      });

      it('sets the end PTS/DTS to the max end PTS/DTS if the fragment is the last of a non-live stream, and has a/v intersection', function () {
        const startPTS = 2;
        const endPTS = 12;
        const startDTS = 1;
        const endDTS = 11;

        frag.startPTS = 3;
        frag.endPTS = 13;
        frag.startDTS = 2;
        frag.endDTS = 12;

        details.endSN = 5;
        details.live = false;
        frag.sn = 5;

        LevelHelper.updateFragPTSDTS(details, frag, startPTS, endPTS, startDTS, endDTS);
        checkFragProperties(frag, 3, 13, 2, 12, 3);
        assert.strictEqual(frag.deltaPTS, 1);
      });
    });

    describe('drift calculation', function () {
      let startPTS;
      let endPTS;
      let startDTS;
      let endDTS;
      beforeEach(function () {
        startPTS = 2;
        endPTS = 12;
        startDTS = 1;
        endDTS = 11;
        details.startSN = 0;
        details.endSN = 10;
      });

      it('returns a drift of 0 if the fragment is out of the sequence range of its level', function () {
        frag.sn = 50;
        assert.strictEqual(LevelHelper.updateFragPTSDTS(details, frag, startPTS, endPTS, startDTS, endDTS), 0);
      });

      it('returns the drift between startPTS and fragStart if the fragment is within the sequence range', function () {
        frag.sn = 0;
        frag.start = 0;
        assert.strictEqual(LevelHelper.updateFragPTSDTS(details, frag, startPTS, endPTS, startDTS, endDTS), 2);
      });
    });
  });
});
