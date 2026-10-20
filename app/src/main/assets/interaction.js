/* SENOJ Media X — Digital Dolls interaction layer.
 * ONE command vocabulary driving THREE input modes:
 *   (1) screen/touch  — action buttons + tap (buttons call dispatch with the action word)
 *   (2) text          — typed commands parsed by parseCommand()
 *   (3) voice         — Web Speech API transcripts fed into the SAME parseCommand()
 * Actions run on a rigged mesh via THREE.AnimationMixer. If the loaded GLB has
 * no animation clips, procedural clips are synthesized from its skeleton.
 * If it has no skeleton at all, only root-level actions (turn / come / idle bob)
 * are possible and bone actions report that a rigged mesh is required.
 * Spec: REALISM-REBUILD.md (Corey ruling 2026-10-20: interactive rigged mesh, no splats).
 */
(function (global) {
  'use strict';

  // ---------------- Command vocabulary ----------------
  // Order matters: specific phrases are tested before generic ones.
  var COMMANDS = [
    { action: 'come',  patterns: [/\bcome here\b/, /\bcome closer\b/, /\bcome to me\b/, /\bstep closer\b/, /\bapproach\b/] },
    { action: 'turn',  patterns: [/\bturn around\b/, /\bspin around\b/, /\bspin\b/, /\bturn\b/, /\bface away\b/, /\bshow (me )?your back\b/] },
    { action: 'wave',  patterns: [/\bwave\b/, /\bsay hi\b/, /\bsay hello\b/, /\bhello\b/, /\bgreet\b/] },
    { action: 'dance', patterns: [/\bdance\b/, /\bdancing\b/, /\bboogie\b/, /\bmove for me\b/] },
    { action: 'pose',  patterns: [/\bstrike a pose\b/, /\bpose\b/, /\bmodel for me\b/, /\bfreeze\b/, /\bhold still\b/] },
    { action: 'walk',  patterns: [/\bwalk\b/, /\bwalking\b/, /\bstrut\b/] },
    { action: 'idle',  patterns: [/\bstop\b/, /\bidle\b/, /\breset\b/, /\bstand still\b/, /\bbe still\b/, /\brelax\b/] }
  ];
  var ACTION_LIST = ['idle', 'wave', 'turn', 'dance', 'pose', 'walk', 'come'];

  function parseCommand(text) {
    if (!text) return null;
    var t = ' ' + String(text).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    // strip common wake phrases / filler so "hey brad, wave for me" parses
    t = t.replace(/\b(hey|ok|okay|please|doll|brad|dustin|baby|girl)\b/g, ' ');
    for (var i = 0; i < COMMANDS.length; i++) {
      for (var j = 0; j < COMMANDS[i].patterns.length; j++) {
        if (COMMANDS[i].patterns[j].test(t)) return { action: COMMANDS[i].action, raw: text };
      }
    }
    return null;
  }

  // ---------------- Bone discovery ----------------
  var BONE_ALIASES = {
    hips:  ['hips', 'pelvis', 'root'],
    spine: ['spine', 'spine01', 'spine1'],
    chest: ['chest', 'spine02', 'spine2', 'upperchest'],
    neck:  ['neck'],
    head:  ['head'],
    armR:  ['rightarm', 'armr', 'rarm', 'upperarmr'],
    armL:  ['leftarm', 'arml', 'larm', 'upperarml'],
    foreR: ['rightforearm', 'forearmr', 'lowerrarm', 'rightlowerarm'],
    foreL: ['leftforearm', 'forearml', 'lowerlarml', 'leftlowerarm'],
    handR: ['righthand', 'handr'],
    handL: ['lefthand', 'handl'],
    legR:  ['rightupleg', 'rightthigh', 'uplegr', 'thighr'],
    legL:  ['leftupleg', 'leftthigh', 'uplegl', 'thighl'],
    shinR: ['rightleg', 'rightshin', 'rightcalf', 'legr'],
    shinL: ['leftleg', 'leftshin', 'leftcalf', 'legl']
  };
  function canonName(name) {
    return String(name || '').toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/[^a-z0-9]/g, '');
  }
  function findBones(rootObj) {
    var found = {}, all = [];
    rootObj.traverse(function (o) { if (o.isBone) all.push(o); });
    Object.keys(BONE_ALIASES).forEach(function (key) {
      for (var i = 0; i < all.length; i++) {
        var cn = canonName(all[i].name);
        if (BONE_ALIASES[key].indexOf(cn) >= 0) { found[key] = all[i]; break; }
      }
    });
    return { bones: found, count: all.length };
  }

  // ---------------- Procedural clip synthesis ----------------
  function qTrack(THREE, bone, samples) {
    // samples: [{t, e:[x,y,z]}] euler degrees -> QuaternionKeyframeTrack on the bone's own name
    var times = [], vals = [];
    samples.forEach(function (s) {
      var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(s.e[0]), THREE.MathUtils.degToRad(s.e[1]), THREE.MathUtils.degToRad(s.e[2])));
      times.push(s.t); vals.push(q.x, q.y, q.z, q.w);
    });
    return new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, vals);
  }
  function osc(dur, steps, fn) {
    var out = [];
    for (var i = 0; i <= steps; i++) { var t = dur * i / steps; out.push({ t: t, e: fn(t / dur * Math.PI * 2) }); }
    return out;
  }
  function synthClips(THREE, b) {
    var clips = {};
    function add(name, tracks, dur, loop) {
      tracks = tracks.filter(Boolean);
      if (!tracks.length) return;
      var c = new THREE.AnimationClip(name, dur, tracks);
      c.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
      clips[name] = c;
    }
    if (b.armR && b.foreR) {
      var waveTracks = [
        qTrack(THREE, b.armR, [{t:0,e:[0,0,0]},{t:0.3,e:[0,0,-125]},{t:1.7,e:[0,0,-125]},{t:2,e:[0,0,0]}]),
        qTrack(THREE, b.foreR, osc(2, 16, function (p) { return [0, 0, -25 + Math.sin(p * 3) * 25]; }))
      ];
      add('wave', waveTracks, 2, false);
    }
    if (b.hips) {
      add('dance', [
        qTrack(THREE, b.hips, osc(2.4, 24, function (p) { return [0, Math.sin(p * 2) * 18, Math.sin(p) * 6]; })),
        b.armR ? qTrack(THREE, b.armR, osc(2.4, 24, function (p) { return [0, 0, -60 + Math.sin(p * 2) * 40]; })) : null,
        b.armL ? qTrack(THREE, b.armL, osc(2.4, 24, function (p) { return [0, 0, 60 - Math.sin(p * 2) * 40]; })) : null
      ], 2.4, true);
      add('idle', [
        qTrack(THREE, b.hips, osc(3.2, 16, function (p) { return [0, Math.sin(p) * 2.5, 0]; })),
        b.chest || b.spine ? qTrack(THREE, (b.chest || b.spine), osc(3.2, 16, function (p) { return [Math.sin(p) * 2, 0, 0]; })) : null
      ], 3.2, true);
    }
    if (b.legR && b.legL) {
      add('walk', [
        qTrack(THREE, b.legR, osc(1.0, 12, function (p) { return [Math.sin(p) * 32, 0, 0]; })),
        qTrack(THREE, b.legL, osc(1.0, 12, function (p) { return [Math.sin(p + Math.PI) * 32, 0, 0]; })),
        b.armR ? qTrack(THREE, b.armR, osc(1.0, 12, function (p) { return [Math.sin(p + Math.PI) * 22, 0, 0]; })) : null,
        b.armL ? qTrack(THREE, b.armL, osc(1.0, 12, function (p) { return [Math.sin(p) * 22, 0, 0]; })) : null
      ], 1.0, true);
    }
    if (b.armR && b.armL) {
      add('pose', [
        qTrack(THREE, b.armR, [{t:0,e:[0,0,0]},{t:0.5,e:[-10,0,-55]}]),
        qTrack(THREE, b.armL, [{t:0,e:[0,0,0]},{t:0.5,e:[-10,0,55]}]),
        b.head ? qTrack(THREE, b.head, [{t:0,e:[0,0,0]},{t:0.5,e:[-6,12,0]}]) : null
      ], 0.5, false);
    }
    return clips;
  }

  // ---------------- Controller ----------------
  function createController(THREE, hooks) {
    hooks = hooks || {};
    var log = hooks.log || function () {};
    var root = null, mixer = null, clips = {}, bones = {}, boneCount = 0;
    var active = null, tween = null, baseZ = 0;

    function stopCurrent() {
      if (mixer && active) { active.fadeOut(0.25); active = null; }
      tween = null;
    }
    function startClip(name, hold) {
      if (!mixer || !clips[name]) return false;
      if (active) { active.fadeOut(0.25); active = null; }
      var a = mixer.clipAction(clips[name]);
      a.reset(); a.enabled = true;
      a.setLoop(clips[name].loop === THREE.LoopRepeat ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      if (hold) { a.clampWhenFinished = true; }
      a.fadeIn(0.25); a.play(); active = a;
      return true;
    }
    var api = {
      attach: function (rootObj, gltfAnimations) {
        root = rootObj; baseZ = rootObj.position.z; tween = null; active = null;
        var fb = findBones(rootObj);
        bones = fb.bones; boneCount = fb.count;
        clips = {}; mixer = null;
        if (gltfAnimations && gltfAnimations.length) {
          mixer = new THREE.AnimationMixer(rootObj);
          gltfAnimations.forEach(function (c) {
            var n = c.name.toLowerCase();
            ACTION_LIST.forEach(function (a) { if (n.indexOf(a) >= 0) clips[a] = c; });
            if (!clips.idle && /idle|stand/.test(n)) clips.idle = c;
          });
          log('Interaction: rigged mesh with ' + gltfAnimations.length + ' baked clips, mapped: ' + Object.keys(clips).join(', '));
        }
        if (boneCount > 0 && Object.keys(clips).length < 3) {
          var synth = synthClips(THREE, bones);
          Object.keys(synth).forEach(function (k) { if (!clips[k]) clips[k] = synth[k]; });
          if (!mixer && Object.keys(clips).length) mixer = new THREE.AnimationMixer(rootObj);
          log('Interaction: skeleton found (' + boneCount + ' bones); actions available: ' + Object.keys(clips).join(', '));
        }
        if (!mixer) log('Interaction: no skeleton/clips on this model — turn / come here / idle only. A rigged mesh unlocks the full set.');
        api.play('idle');
        return api;
      },
      hasRig: function () { return boneCount > 0; },
      actions: function () {
        var base = ['idle', 'turn', 'come'];
        return Object.keys(clips).concat(base).filter(function (v, i, a) { return a.indexOf(v) === i; });
      },
      play: function (action) {
        if (!root) return false;
        if (action === 'turn') {
          stopCurrent();
          tween = { type: 'turn', t: 0, dur: 1.4, from: root.rotation.y, to: root.rotation.y + Math.PI * 2 };
          if (clips.idle) startClip('idle');
          return true;
        }
        if (action === 'come') {
          stopCurrent();
          tween = { type: 'come', t: 0, dur: 1.6, from: root.position.z, to: Math.min(root.position.z + 0.9, baseZ + 1.4) };
          if (clips.walk) startClip('walk');
          return true;
        }
        if (clips[action]) { startClip(action, action === 'pose'); return true; }
        if (action === 'idle') { stopCurrent(); return true; }
        log('Action "' + action + '" needs a rigged mesh (no skeleton on the current model).');
        return false;
      },
      update: function (dt) {
        if (mixer) mixer.update(dt);
        if (tween && root) {
          tween.t += dt;
          var k = Math.min(tween.t / tween.dur, 1);
          var e = 1 - Math.pow(1 - k, 3);
          if (tween.type === 'turn') root.rotation.y = tween.from + (tween.to - tween.from) * e;
          if (tween.type === 'come') root.position.z = tween.from + (tween.to - tween.from) * e;
          if (k >= 1) { var wasWalk = tween.type === 'come'; tween = null; if (wasWalk) api.play('idle'); }
        }
      }
    };
    return api;
  }

  // ---------------- Voice input (Web Speech API) ----------------
  function startVoice(onText, onState) {
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) { if (onState) onState('unsupported'); return null; }
    var rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = function (e) { if (onText) onText(e.results[0][0].transcript); };
    rec.onerror = function (e) { if (onState) onState('error:' + e.error); };
    rec.onend = function () { if (onState) onState('ended'); };
    if (onState) onState('listening');
    try { rec.start(); } catch (err) { if (onState) onState('error:' + err.message); return null; }
    return rec;
  }

  var api = { ACTIONS: ACTION_LIST, parseCommand: parseCommand, createController: createController, startVoice: startVoice, findBones: findBones };
  global.DollInteraction = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
