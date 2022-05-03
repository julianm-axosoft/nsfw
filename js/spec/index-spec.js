const assert = require('assert');
const exec = require('executive');
const fse = require('fs-extra');
const path = require('path');

const { DEBOUNCE, TIMEOUT_PER_STEP, WORKDIR: workDir, sleep } = require('./common');

const nsfw = require('../src');

describe('Node Sentinel File Watcher', function() {
  this.timeout(1200000);

  assert.ok(typeof nsfw._native.NSFW_TEST_SLOW === 'undefined', 'NSFW should NOT be built in slow mode');

  beforeEach(async function() {
    async function makeDir(identifier) {
      await fse.mkdir(path.join(workDir, 'test' + identifier));
      await fse.mkdir(path.join(workDir, 'test' + identifier, 'folder' + identifier));
      const fd = await fse.open(path.join(workDir, 'test' + identifier, 'testing' + identifier +'.file'), 'w');
      await fse.write(fd, 'testing');
      await fse.close(fd);
    }

    try {
      await fse.remove(workDir);
    } catch (e) {/* we don't care about this failure */}

    await fse.mkdir(workDir);
    const promises = [];
    for (let i = 0; i < 10; ++i) {
      promises.push(makeDir(i));
    }

    await Promise.all(promises);
  });

  afterEach(function() {
    return fse.remove(workDir);
  });

  describe('Basic', function() {
    it('can watch a single file', async function() {
      const file = 'testing1.file';
      const inPath = path.resolve(workDir, 'test1');
      const filePath = path.join(inPath, file);
      let changeEvents = 0;
      let createEvents = 0;
      let deleteEvents = 0;

      function findEvents(element) {
        if (
          element.action === nsfw.actions.MODIFIED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          changeEvents++;
        } else if (
          element.action === nsfw.actions.CREATED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          createEvents++;
        } else if (
          element.action === nsfw.actions.DELETED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          deleteEvents++;
        }
      }

      let watch = await nsfw(
        filePath,
        events => events.forEach(findEvents),
        { debounceMS: 100 }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.writeFile(filePath, 'Bean bag video games at noon.');
        await sleep(TIMEOUT_PER_STEP);
        await fse.remove(filePath);
        await sleep(TIMEOUT_PER_STEP);
        await fse.writeFile(filePath, 'His watch has ended.');
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(changeEvents > 0);
        assert.equal(createEvents, 1);
        assert.equal(deleteEvents, 1);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('can listen for a create event', async function() {
      const file = 'another_test.file';
      const inPath = path.resolve(workDir, 'test2', 'folder2');
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.writeFile(path.join(inPath, file), 'Peanuts, on occasion, rain from the skies.');
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(eventFound);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('can listen for a delete event', async function() {
      const file = 'testing3.file';
      const inPath = path.resolve(workDir, 'test3');
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.DELETED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.remove(path.join(inPath, file));
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(eventFound);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('can listen for a modify event', async function() {
      const file = 'testing0.file';
      const inPath = path.resolve(workDir, 'test0');
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.MODIFIED &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.writeFile(path.join(inPath, file), 'At times, sunflower seeds are all that is life.');
        await sleep(TIMEOUT_PER_STEP);

        assert(eventFound);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    if (process.platform !== 'darwin') {
      // this test is super flakey on CI right now
      it('can listen for a rename event', async function() {
        const srcFile = 'testing.file';
        const destFile = 'new-testing.file';
        const inPath = path.resolve(workDir, 'test4');
        let eventListening = false;
        let deleteEventFound = false;
        let createEventFound = false;
        let renameEventFound = false;
        let extraEventFound = false;

        function findEvent(element) {
          if (!eventListening) {
            return;
          }
          if (
            element.action === nsfw.actions.RENAMED &&
            element.directory === inPath &&
            element.oldFile === srcFile &&
            element.newDirectory === inPath &&
            element.newFile === destFile
          ) {
            renameEventFound = true;
          } else if (
            element.action === nsfw.actions.DELETED &&
            element.directory === path.resolve(inPath) &&
            element.file === srcFile
          ) {
            deleteEventFound = true;
          } else if (
            element.action === nsfw.actions.CREATED &&
            element.directory === path.resolve(inPath) &&
            element.file === destFile
          ) {
            createEventFound = true;
          } else {
            if (element.directory === path.resolve(inPath)) {
              extraEventFound = true;
            }
          }
        }

        let watch = await nsfw(
          workDir,
          events => events.forEach(findEvent),
          { debounceMS: DEBOUNCE }
        );

        try {
          await watch.start();
          await sleep(TIMEOUT_PER_STEP);
          await fse.ensureFile(path.join(inPath, srcFile));
          await sleep(TIMEOUT_PER_STEP);
          eventListening = true;
          await fse.move(path.join(inPath, srcFile), path.join(inPath, destFile));
          await sleep(TIMEOUT_PER_STEP);
          eventListening = false;

          switch (process.platform) {
            case 'darwin':
              assert.ok(deleteEventFound && createEventFound !== renameEventFound);
              break;

            default:
              assert.ok(renameEventFound);
              assert.ok(!deleteEventFound && !createEventFound);
              break;
          }

          assert.ok(!extraEventFound);
        } finally {
          await watch.stop();
          watch = null;
        }
      });
    }

    it('can listen for a move event', async function() {
      const file = 'testing.file';
      const srcInPath = path.resolve(workDir, 'test4', 'src');
      const destInPath = path.resolve(workDir, 'test4', 'dest');
      let eventListening = false;
      let deleteEventFound = false;
      let createEventFound = false;
      let renameEventFound = false;
      let extraEventFound = false;

      function findEvent(element) {
        if (!eventListening) {
          return;
        }
        if (
          element.action === nsfw.actions.RENAMED &&
          element.directory === path.resolve(srcInPath) &&
          element.oldFile === file &&
          element.newDirectory === path.resolve(destInPath) &&
          element.newFile === file
        ) {
          renameEventFound = true;
        } else if (
          element.action === nsfw.actions.DELETED &&
          element.directory === path.resolve(srcInPath) &&
          element.file === file
        ) {
          deleteEventFound = true;
        } else if (
          element.action === nsfw.actions.CREATED &&
          element.directory === path.resolve(destInPath) &&
          element.file === file
        ) {
          createEventFound = true;
        } else {
          if (element.file === file) {
            extraEventFound = true;
          }
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.ensureFile(path.join(srcInPath, file));
        await fse.ensureDir(path.join(destInPath));
        await sleep(TIMEOUT_PER_STEP);
        eventListening = true;
        await fse.move(path.join(srcInPath, file), path.join(destInPath, file));
        await sleep(TIMEOUT_PER_STEP);
        eventListening = false;

        switch (process.platform) {
          case 'linux':
            assert.ok(renameEventFound);
            assert.ok(!deleteEventFound && !createEventFound);
            break;

          default:
            assert.ok(deleteEventFound && createEventFound);
            assert.ok(!renameEventFound);
            break;
        }

        assert.ok(!extraEventFound);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('can run multiple watchers at once', async function() {
      const dirA = path.resolve(workDir, 'test0');
      const fileA = 'testing1.file';
      const dirB = path.resolve(workDir, 'test1');
      const fileB = 'testing0.file';
      let events = 0;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED
        ) {
          if (element.directory === dirA && element.file === fileA) {
            events++;
          } else if (element.directory === dirB && element.file === fileB) {
            events++;
          }
        }
      }

      let watchA = await nsfw(
        dirA,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );
      let watchB = await nsfw(
        dirB,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await Promise.all([watchA.start(), watchB.start()]);
        await sleep(TIMEOUT_PER_STEP);
        await Promise.all([
          fse.writeFile(path.join(dirA, fileA), 'At times, sunflower seeds are all that is life.'),
          fse.writeFile(path.join(dirB, fileB), 'At times, sunflower seeds are all that is life.')
        ]);
        await sleep(TIMEOUT_PER_STEP);

        assert.equal(events, 2);
      } finally {
        await Promise.all([watchA.stop(), watchB.stop()]);
        watchA = null;
        watchB = null;
      }
    });

    it('will properly track the movement of watched directories across watched directories', async function() {
      const performRenameProcedure = async (number) => {
        await fse.mkdir(path.join(workDir, `test${number}`, 'sneaky-folder'));
        await fse.move(
          path.join(workDir, `test${number}`, `folder${number}`),
          path.join(workDir, `test${number + 1}`, 'bad-folder')
        );
        await fse.move(
          path.join(workDir, `test${number}`, 'sneaky-folder'),
          path.join(workDir, `test${number}`, 'bad-folder')
        );
        await fse.remove(path.join(workDir, `test${number}`));
        await fse.remove(path.join(workDir, `test${number + 1}`));
      };

      let watch = await nsfw(workDir, () => {}, { debounceMS: DEBOUNCE });

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await Promise.all([
          performRenameProcedure(0),
          performRenameProcedure(2),
          performRenameProcedure(4),
          performRenameProcedure(6),
          performRenameProcedure(8)
        ]);
        await sleep(TIMEOUT_PER_STEP);
      } finally {
        await watch.stop();
        watch = null;
      }
    });
  });

  describe('Recursive', function() {
    it('can listen for the destruction of a directory and its subtree', async function() {
      const inPath = path.resolve(workDir, 'test4');
      let deletionCount = 0;

      function findEvent(element) {
        if (element.action === nsfw.actions.DELETED)
        {
          if (element.directory === path.resolve(inPath)
              && (element.file === 'testing4.file' || element.file === 'folder4'))
          {
            deletionCount++;
          }
          else if (element.directory === workDir && element.file === 'test4')
          {
            deletionCount++;
          }
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.remove(inPath);
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(deletionCount > 2);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('does not loop endlessly when watching directories with recursive symlinks', async function () {
      await fse.mkdir(path.join(workDir, 'test'));
      await fse.symlink(path.join(workDir, 'test'), path.join(workDir, 'test', 'link'));

      let watch = await nsfw(
        workDir,
        () => {},
        { debounceMS: DEBOUNCE, errorCallback() {} }
      );

      try {
        await watch.start();
        await watch.stop();
      } finally {
        watch = null;
      }
    });
  });

  describe('Pausing', function () {
    it('can pause and resume event reporting', async function () {
      const file = 'another_test.file';
      const inPath = path.resolve(workDir, 'test2', 'folder2');
      let eventFound = false;

      function findEvent(element) {
        if (
          (
            element.action === nsfw.actions.CREATED ||
            element.action === nsfw.actions.MODIFIED
          ) &&
          element.directory === path.resolve(inPath) &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await watch.pause();
        await sleep(TIMEOUT_PER_STEP);
        await fse.writeFile(path.join(inPath, file), 'You will not see me.');
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(!eventFound);

        await watch.resume();
        await sleep(TIMEOUT_PER_STEP);
        assert.ok(!eventFound);

        await fse.writeFile(path.join(inPath, file), 'But you will see me.');
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(eventFound);
      } finally {
        await watch.stop();
        watch = null;
      }
    });
  });

  describe('Errors', function() {
    it('can gracefully recover when the watch folder is deleted', async function() {
      const inPath = path.join(workDir, 'test4');
      let erroredOut = false;
      let watch = await nsfw(
        inPath,
        () => {},
        { debounceMS: DEBOUNCE, errorCallback() { erroredOut = true; } }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.remove(inPath);
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(erroredOut);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('Can pass falsy values to errorCallback', async function() {
      const ok = [undefined, null, 0, '', false];
      const notOk = [1, true, 'a', {}, []];
      await Promise.all([
        ...ok.map(async errorCallback => nsfw(
          workDir,
          () => {},
          { errorCallback }
        )),
        ...notOk.map(async errorCallback => {
          try {
            await nsfw(
              workDir,
              () => {},
              { errorCallback },
            );
          } catch (error) {
            assert.ok(error.message === 'options.errorCallback must be a function.');
            return;
          }
          assert.fail('nsfw must error if errorCallback is not a function nor a falsy value');
        })
      ]);
    });

    it('Report error on rename watched folder', async function() {
      const inPath = path.join(workDir, 'test4');
      const renamed = path.join(workDir, 'test4_renamed');
      let errorOk = false;
      let watch = await nsfw(
        inPath,
        () => { },
        {
          errorCallback: (error) => {
            errorOk = error.message === 'Service shutdown: root path changed (renamed or deleted)';
          }
        }
      );
      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.rename(inPath, renamed);
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(errorOk);
      } finally {
        try {
          await watch.stop();
        } catch (err) { /* do nothing */ }
        watch = null;
      }
    });

    if (process.platform !== 'win32') {
      it('Report error on delete watched folder', async function() {
        const inPath = path.join(workDir, 'test5');
        let errorMsg = '';
        let watch = await nsfw(
          inPath,
          () => { },
          {
            errorCallback: (error) => {
              errorMsg = error.message;
            }
          }
        );
        try {
          await sleep(100);
          await watch.start();
          await sleep(TIMEOUT_PER_STEP);
          await fse.remove(inPath);
          await sleep(TIMEOUT_PER_STEP);

          assert.equal(errorMsg, 'Service shutdown: root path changed (renamed or deleted)');
        } finally {
          try {
            await watch.stop();
          } catch (err) { /* do nothing */ }
          watch = null;
        }
      });

      it('Report error on rename parent of the watched folder', async function() {
        const parentPath = path.join(workDir, 'test4');
        const renamed = path.join(workDir, 'test4_renamed');
        const inPath = path.join(parentPath, 'test4_watched');
        let errorOk = false;
        let watch;
        try {
          await fse.mkdir(inPath);
          await sleep(TIMEOUT_PER_STEP);
          watch = await nsfw(
            inPath,
            () => { },
            {
              errorCallback: (error) => {
                errorOk = error.message === 'Service shutdown: root path changed (renamed or deleted)';
              }
            }
          );
          await watch.start();
          await sleep(TIMEOUT_PER_STEP);
          await fse.rename(parentPath, renamed);
          await sleep(TIMEOUT_PER_STEP);

          assert.ok(errorOk);
        } finally {
          try {
            await watch.stop();
          } catch (err) { /* do nothing */ }
          watch = null;
        }
      });

      it('Report error on delete parent of the watched folder', async function() {
        const parentPath = path.join(workDir, 'test4');
        const inPath = path.join(parentPath, 'test4_watched');
        let errorOk = false;
        let watch;
        try {
          await fse.mkdir(inPath);
          await sleep(TIMEOUT_PER_STEP);
          watch = await nsfw(
            inPath,
            () => { },
            {
              errorCallback: (error) => {
                errorOk = error.message === 'Service shutdown: root path changed (renamed or deleted)';
              }
            }
          );
          await watch.start();
          await sleep(TIMEOUT_PER_STEP);
          await fse.remove(parentPath);
          await sleep(TIMEOUT_PER_STEP);

          assert.ok(errorOk);
        } finally {
          try {
            await watch.stop();
          } catch (err) { /* do nothing */ }
          watch = null;
        }
      });
    }

  });

  describe('Stress', function() {
    const stressRepoPath = path.resolve('nsfw-stress-test');

    beforeEach(function() {
      return exec('git clone https://github.com/implausible/nsfw-stress-test');
    });

    it('does not segfault under stress', async function() {
      let count = 0;
      let errorRestart = Promise.resolve();
      let watch = await nsfw(
        stressRepoPath,
        () => { count++; },
        {
          errorCallback() {
            errorRestart = errorRestart.then(async () => {
              await watch.stop();
              await watch.start();
            });
          }
        }
      );

      try {
        await watch.start();
        await fse.remove(path.join(stressRepoPath, 'folder'));
        await errorRestart;
        assert.ok(count > 0);

        await watch.stop();
        await fse.remove(stressRepoPath);
        await fse.mkdir(stressRepoPath);

        count = 0;
        errorRestart = Promise.resolve();
        watch = await nsfw(
          stressRepoPath,
          () => { count++; },
          {
            errorCallback() {
              errorRestart = errorRestart.then(async () => {
                await watch.stop();
                await watch.start();
              });
            }
          }
        );

        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await exec(
          `git clone https://github.com/implausible/nsfw-stress-test ${path.join('nsfw-stress-test', 'test')}`
        );
        await fse.stat(path.join(stressRepoPath, 'test'));
        await fse.remove(path.join(stressRepoPath, 'test'));
        await errorRestart;

        assert.ok(count > 0);
      } finally {
        await watch.stop();
        watch = null;
      }
    });

    it('creates and destroys many watchers', async function() {
      for (let i = 0; i < 100; i++) {
        const watcher = await nsfw(stressRepoPath, () => {});
        await watcher.start();
        await watcher.stop();
      }
    });

    afterEach(function() {
      return fse.remove(stressRepoPath);
    });
  });

  describe('Unicode support', function() {
    const watchPath = path.join(workDir, 'は');
    beforeEach(function() {
      return fse.mkdir(watchPath);
    });

    it('supports watching unicode directories', async function() {
      const file = 'ñ_unicoded_right_in_the.talker';
      let eventFound = false;

      function findEvent(element) {
        if (
          element.action === nsfw.actions.CREATED &&
          element.directory === watchPath &&
          element.file === file
        ) {
          eventFound = true;
        }
      }

      let watch = await nsfw(
        workDir,
        events => events.forEach(findEvent),
        { debounceMS: DEBOUNCE }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT_PER_STEP);
        await fse.writeFile(path.join(watchPath, file), 'Unicode though.');
        await sleep(TIMEOUT_PER_STEP);

        assert.ok(eventFound);
      } finally {
        await watch.stop();
        watch = null;
      }
    });
  });

  describe.only('Excluded paths', function() {
    it('can ignore events from excluded paths', async function () {
      const inPath = path.join(workDir, 'test4');
      const exludedPath = path.join(inPath, 'excluded');
      await fse.mkdir(exludedPath);
      const file = 'excluded.file';
      const filePath = path.join(exludedPath, file);
      const TIMEOUT = 300;

      let changeEvents = 0;
      let createEvents = 0;
      let deleteEvents = 0;

      function findEvents(element) {
        if (
          element.action === nsfw.actions.MODIFIED
        ) {
          changeEvents++;
        } else if (
          element.action === nsfw.actions.CREATED
        ) {
          createEvents++;
        } else if (
          element.action === nsfw.actions.DELETED
        ) {
          deleteEvents++;
        }
      }

      await sleep(TIMEOUT);
      let watch = await nsfw(
        inPath,
        events => events.forEach(findEvents),
        {
          debounceMS: 100,
          excludedPaths: [exludedPath]
        }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT);
        await fse.writeFile(filePath, 'Excluded.');
        await sleep(TIMEOUT);
        await fse.remove(filePath);
        await sleep(TIMEOUT);
        await fse.writeFile(filePath, 'Excluded.');
        await sleep(TIMEOUT);
        await fse.appendFile(filePath, 'Append');
        await sleep(TIMEOUT);
        // A delete event will be captured
        await fse.remove(path.join(inPath, 'testing4.file'));
        await sleep(TIMEOUT);

        assert.equal(changeEvents, 0);
        assert.equal(createEvents, 0);
        assert.equal(deleteEvents, 1);
      } finally {
        await watch.stop();
        watch = null;
      }

    });

    it.only('can modify excluded paths', async function () {
      const inPath = path.join(workDir, 'test4');
      const exludedPath = path.join(inPath, 'excluded');
      await fse.mkdir(exludedPath);
      const file = 'excluded.file';
      const filePath = path.join(exludedPath, file);

      const newExludedPath = path.join(inPath, 'newExcluded');
      await fse.mkdir(newExludedPath);
      const newFile = 'excluded.file';
      const newFilePath = path.join(newExludedPath, newFile);

      const TIMEOUT = 300;

      let changeEvents = 0;
      let createEvents = 0;
      let deleteEvents = 0;

      function findEvents(element) {
        if (
          element.action === nsfw.actions.MODIFIED
        ) {
          changeEvents++;
        } else if (
          element.action === nsfw.actions.CREATED
        ) {
          createEvents++;
        } else if (
          element.action === nsfw.actions.DELETED
        ) {
          deleteEvents++;
        }
      }

      await sleep(TIMEOUT);
      let watch = await nsfw(
        inPath,
        events => events.forEach(findEvents),
        {
          debounceMS: 100,
          excludedPaths: [exludedPath]
        }
      );

      try {
        await watch.start();
        await sleep(TIMEOUT);

        const paths = await watch.getExcludedPaths();
        assert.equal(paths.length, 1);
        assert.equal(paths[0], exludedPath);
        await watch.updateExcludedPaths([exludedPath, newExludedPath]);
        const newpaths = await watch.getExcludedPaths();
        assert.equal(newpaths.length, 2);

        await fse.writeFile(filePath, 'Excluded.');
        await sleep(TIMEOUT);
        await fse.remove(filePath);
        await sleep(TIMEOUT);
        await fse.writeFile(filePath, 'Excluded.');
        await sleep(TIMEOUT);
        await fse.appendFile(filePath, 'Append');
        await sleep(TIMEOUT);

        await fse.writeFile(newFilePath, 'New excluded.');
        await sleep(TIMEOUT);
        await fse.remove(newFilePath);
        await sleep(TIMEOUT);
        await fse.writeFile(newFilePath, 'New excluded.');
        await sleep(TIMEOUT);
        await fse.appendFile(newFilePath, 'New append');
        await sleep(TIMEOUT);


        // This delete event will be captured because it is not in the excluded paths
        await fse.remove(path.join(inPath, 'testing4.file'));
        await sleep(TIMEOUT);

        assert.equal(changeEvents, 0);
        assert.equal(createEvents, 0);
        assert.equal(deleteEvents, 1);
      } finally {
        await watch.stop();
        watch = null;
      }
    });
  });

  describe('Garbage collection', function() {
    it('can garbage collect all instances', async function () {
      this.timeout(60000);
      let threw = false;
      try {
        // Try to get an error coming from the C++ constructor by passing a bad callback
        await nsfw(workDir, () => {}, { errorCallback: 'not a callback' });
      } catch (e) {
        threw = true;
      } if (!threw) {
        assert.fail('nsfw must throw when provided a bad callback');
      }
      while (nsfw.getAllocatedInstanceCount() > 0) {
        global.gc();
        await sleep(0);
      }
    });
  });
});
