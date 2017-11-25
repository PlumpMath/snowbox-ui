Phaser.Sprite.prototype.alignInParent = function (position, offsetX, offsetY) {
    if ((!this.parent) || (this.parent.name === "__world")) {
        return;
    }

    var s = this.parent.scale;
    this.parent.scale.setTo(1);
    this.alignIn(this.parent, position, offsetX, offsetY);

    this.left -= this.parent.left + (this.parent.width * this.parent.anchor.x);
    this.top -= this.parent.top + (this.parent.height * this.parent.anchor.y);

    this.parent.scale = s;
};

Phaser.Button.prototype.alignInParent = Phaser.Sprite.prototype.alignInParent;

var game = new Phaser.Game(window.innerWidth, window.innerHeight, Phaser.WEBGL, 'Snowbox', {
    preload: preload,
    create: create,
    update: update,
    render: render
});

function preload() {
    game.stage.disableVisibilityChange = true;

    game.load.image('background', 'assets/snow_tile.jpg');
    game.load.spritesheet('boy', 'assets/boy.png', 48, 48);
    game.load.spritesheet('girl', 'assets/girl.png', 48, 48);

    game.load.image('dialog_9patch', 'assets/controls/panel_blue.png');
    game.load.image('textField_9patch', 'assets/controls/buttonSquare_grey_pressed.png');

    game.load.audio('login_music', 'assets/music/Snowland.mp3');
    game.load.audio('battle_music', 'assets/music/wintery loop.wav');
    game.load.audio('snow_run', 'assets/music/snow_run.mp3');

    sprites_preload();
    helper_preload();

    game.add.plugin(PhaserInput.Plugin);
    var plugin = game.plugins.add(Phaser.Plugin.AdvancedTiming);
    plugin.mode = 'domText';

    game.scale.scaleMode = Phaser.ScaleManager.RESIZE;
    game.scale.parentIsWindow = true;
    game.scale.refresh();
}

var player;
var cursors;
var snowballs;
var playerId;
var loginMusic;
var battleMusic;
var stepsSound;

var snowballMap = new Map();
var enemiesMap = new Map();
var scoresMap = new Map();
var trees = [];
var movableObjects = [];

function create() {
    load9PatchImage('dialog', 'dialog_9patch', 480, 320, 10, 10, 90, 90);
    load9PatchImage('textField', 'textField_9patch', 160, 40, 5, 5, 40, 40);
    load9PatchImage('squareButton', 'textField_9patch', 48, 48, 5, 5, 40, 40);

    game.renderer.renderSession.roundPixels = true;

    game.add.tileSprite(-1000, -1000, 4000, 4000, 'background');

    loginMusic = game.add.audio('login_music', 0.3, true);
    battleMusic = game.add.audio('battle_music', 0, true);
    loginMusic.play();

    stepsSound = game.add.audio('snow_run', 1, true);

    connectToServer();

    if (window.location.hostname === 'localhost') {
        sendStartGame('buggy', Math.random() < 0.5 ? 'boy' : 'girl');
    } else {
        createStartDialog(sendStartGame);
    }

    createMuteButton();
}

function createPlayerSprite(id, x, y, name, skin, labelColor) {
    var sprite = game.add.sprite(x, y, skin);
    sprite.animations.add('moveLeft', [1, 5, 9, 13], 12, true);
    sprite.animations.add('moveRight', [3, 7, 11, 15], 12, true);
    sprite.animations.add('moveTop', [2, 6, 10, 14], 12, true);
    sprite.animations.add('moveBottom', [0, 4, 8, 12], 12, true);

    game.physics.enable(sprite, Phaser.Physics.ARCADE);
    sprite.body.collideWorldBounds = true;

    var nameLabel = game.make.text(0, 0, name, {
        font: "14px Arial",
        fill: labelColor
    });
    sprite.addChild(nameLabel);
    nameLabel.x = Math.round((sprite.width - nameLabel.width) / 2);
    nameLabel.y = -12;

    sprite.physicsBodyType = Phaser.Physics.ARCADE;
    sprite.body.bounce.set(0, 0);
    var bodyRadius = 12;
    sprite.body.setCircle(
        bodyRadius,
        (sprite.width / 2 - bodyRadius),
        (sprite.height / 2 - bodyRadius));

    sprite.model = {
        id: id,
        name: name,
        score: ko.observable(0)
    };

    var scoreLabel = game.add.text(0, 16, name + ': ' + sprite.model.score(), {
        font: "18px Arial",
        fill: labelColor,
        stroke: '#000000',
        strokeThickness: 1
    });
    scoreLabel.x = 16;
    scoreLabel.fixedToCamera = true;
    scoresMap.set(id, scoreLabel);
    refreshScoreList(sprite);

    sprite.model.score.subscribe(function () {
        scoreLabel.text = name + ': ' + sprite.model.score();

        refreshScoreList();
    });

    sprite.customVelocity = new Phaser.Point(0, 0);
    movableObjects.push(sprite);

    return sprite;
}

function handleGameStarted(data) {
    playerId = data.id;

    game.world.setBounds(0, 0, data.width, data.height);
    game.scale.onSizeChange.add(function () {
        game.world.setBounds(0, 0, data.width, data.height);
    });

    drawBorder(data.width, data.height);

    game.physics.startSystem(Phaser.Physics.ARCADE);

    player = createPlayerSprite(
        data.id,
        game.world.centerX,
        game.world.centerY,
        data.playerName,
        data.skin,
        '#0000d0');

    cursors = game.input.keyboard.createCursorKeys();
    game.input.keyboard.onDownCallback = keyDown;
    game.input.keyboard.onUpCallback = keyUp;

    game.camera.follow(player);
    game.camera.bounds = null;


    var clickArea = game.add.sprite(0, 0);
    clickArea.fixedToCamera = true;
    clickArea.scale.setTo(game.width, game.height);
    clickArea.inputEnabled = true;
    clickArea.events.onInputDown.add(function () {
        sendThrowBall(
            game.input.mousePointer.x + game.camera.x,
            game.input.mousePointer.y + game.camera.y);
    });
    game.scale.onSizeChange.add(function (scaleManager, width, height) {
        clickArea.scale.setTo(width, height);
    });

    snowballs = game.add.group();
    snowballs.enableBody = true;
    snowballs.physicsBodyType = Phaser.Physics.ARCADE;

    snowballs.createMultiple(50, 'snowball');
    snowballs.setAll('checkWorldBounds', true);
    snowballs.setAll('outOfBoundsKill', true);
    snowballs.setAll('anchor.x', 0.5);
    snowballs.setAll('anchor.y', 0.5);

    snowballs.forEach(function (value) {
        value.customVelocity = new Phaser.Point(0, 0);
        movableObjects.push(value);
    });

    if (data.trees) {
        data.trees.sort(function (a, b) {
            return a.y - b.y;
        });

        data.trees.forEach(function (value) {
            var tree;
            if (value.type && (value.type === 'pinale')) {
                tree = createPineTree(value.width, value.height);
            } else {
                tree = createTree(value.width, value.height);
            }

            tree.x = value.x - tree.trunk.body.offset.x - (tree.trunk.body.width / 2);
            tree.y = value.y - tree.trunk.body.offset.y - (tree.trunk.body.height / 2);

            trees.push(tree);
        });
    }

    if (data.playersInfo) {
        data.playersInfo.forEach(function (value) {
            handleEnemyConnected(value);
        });
    }

    if (data.maxSnowballs) {
        player.model.maxSnowballs = data.maxSnowballs;
        player.model.snowballsCount = ko.observable(player.model.maxSnowballs);
        createPlayerAmmo(player);
    }

    var musicSwitchDelay = 3000;
    loginMusic.fadeTo(musicSwitchDelay, 0);
    setTimeout(function () {
        loginMusic.destroy();

        battleMusic.play();
        this.game.add.tween(battleMusic).to({
            volume: 0.3
        }, musicSwitchDelay, Phaser.Easing.Linear.None, true);
    }, musicSwitchDelay);


    game.world.children.forEach(function (child) {
        if (child.fixedToCamera) {
            game.world.bringToTop(child);
        }
    });
}

function alignToCamera(object, position, offsetX, offsetY) {
    var reposition = function () {
        if (!object.exists) {
            game.scale.onSizeChange.remove(reposition);
            return;
        }

        var y;
        if ((position === Phaser.TOP_LEFT)
            || (position === Phaser.TOP_RIGHT)
            || (position === Phaser.TOP_CENTER)) {
            y = 0;
        } else if ((position === Phaser.LEFT_CENTER)
            || (position === Phaser.RIGHT_CENTER)
            || (position === Phaser.CENTER)) {
            y = (game.camera.height - object.height) / 2;
        } else {
            y = (game.camera.height - object.height);
        }

        var x;
        if ((position === Phaser.TOP_LEFT)
            || (position === Phaser.LEFT_CENTER)
            || (position === Phaser.BOTTOM_LEFT)) {
            x = 0;
        } else if ((position === Phaser.TOP_CENTER)
            || (position === Phaser.BOTTOM_CENTER)
            || (position === Phaser.CENTER)) {
            x = (game.camera.width - object.width) / 2;
        } else {
            x = (game.camera.width - object.width);
        }

        if (object.anchor) {
            y += object.height * object.anchor.y;
            x += object.width * object.anchor.x;
        }

        object.cameraOffset.x = x + offsetX;
        object.cameraOffset.y = y + offsetY;
    };

    game.scale.onSizeChange.add(reposition);
    reposition();
}

function createPlayerAmmo(player) {
    var ammoGroup = game.add.group();
    ammoGroup.fixedToCamera = true;

    var ammoPanel = game.make.sprite(0, 0, 'rpg_ui', 'buttonLong_beige_pressed.png');
    ammoGroup.add(ammoPanel);

    var ammoArray = [];

    var x = 0;
    for (var i = 0; i < player.model.maxSnowballs; i++) {
        var ammo = game.make.sprite(x, 0, 'large_snowball');
        ammo.centerY = ammoPanel.centerY;
        ammoGroup.add(ammo);
        x += ammo.width * 1.4;

        ammoArray.push(ammo);
    }

    var deltaX = (ammoPanel.width - ammo.right) / 2;
    ammoArray.forEach(function (ammo) {
        ammo.x += deltaX;
    });

    player.model.snowballsCount.subscribe(function () {
        var count = player.model.snowballsCount();
        for (var i = 0; i < ammoArray.length; i++) {
            var ammo = ammoArray[i];
            if (i >= count) {
                ammo.alpha = 0.2;
            } else {
                ammo.alpha = 1;
            }
        }
    });

    alignToCamera(ammoGroup, Phaser.BOTTOM_RIGHT, 2, -16);
}

function createMuteButton() {
    var muteButton = createCheckButton('musicOn', 'musicOff', function (sprite, event, checked) {
        battleMusic.mute = checked;
        loginMusic.mute = checked;

        localStorage.setItem('snowbox_muted', checked);
    });

    var mutedStored = localStorage.getItem('snowbox_muted');
    muteButton.checked = (mutedStored === true) || (mutedStored === 'true');
    loginMusic.mute = muteButton.checked;
    battleMusic.mute = muteButton.checked;

    game.world.add(muteButton);
    muteButton.fixedToCamera = true;

    alignToCamera(muteButton, Phaser.TOP_RIGHT, -16, 16);
}

function keyDown(e) {
    if (e.repeat) {
        return;
    }

    if ((e.keyCode === Phaser.Keyboard.UP)
        || (e.keyCode === Phaser.Keyboard.DOWN)
        || (e.keyCode === Phaser.Keyboard.LEFT)
        || (e.keyCode === Phaser.Keyboard.RIGHT)) {
        moveKeyPressed();
        return;
    }
}

function keyUp(e) {
    if (e.repeat) {
        return;
    }

    if ((e.keyCode === Phaser.Keyboard.UP)
        || (e.keyCode === Phaser.Keyboard.DOWN)
        || (e.keyCode === Phaser.Keyboard.LEFT)
        || (e.keyCode === Phaser.Keyboard.RIGHT)) {
        moveKeyPressed();
        return;
    }
}

function animatePlayerMove(sprite, animationName) {
    if (!animationName) {
        if (sprite.animations.currentAnim) {
            sprite.animations.currentAnim.stop(true);
        }
    } else if (sprite.animations.currentAnim.name !== animationName) {
        sprite.animations.play(animationName);
    } else if (!sprite.animations.currentAnim.isPlaying) {
        sprite.animations.currentAnim.play();
    }
}

function moveKeyPressed() {
    var xDirection = 0;
    var yDirection = 0;

    if (cursors.up.isDown) {
        yDirection = -1;
    } else if (cursors.down.isDown) {
        yDirection = 1;
    }

    if (cursors.left.isDown) {
        xDirection = -1;
    } else if (cursors.right.isDown) {
        xDirection = 1;
    }

    sendPlayerMove(xDirection, yDirection);

    var animationName = null;

    if (cursors.up.isDown) {
        animationName = "moveTop";
    } else if (cursors.down.isDown) {
        animationName = "moveBottom";
    } else if (cursors.left.isDown) {
        animationName = "moveLeft";
    } else if (cursors.right.isDown) {
        animationName = "moveRight";
    }

    animatePlayerMove(player, animationName);
}

function startSpriteMovement(sprite, x, y, velocity, angle) {
    sprite.position.set(
        x - sprite.width / 2,
        y - sprite.height / 2);

    game.physics.arcade.velocityFromRotation(
        angle, velocity * 7.92, sprite.customVelocity);
}

function handlePlayerMoved(data) {
    var sprite = getPlayer(data.id);

    if (!sprite) {
        return;
    }

    startSpriteMovement(sprite, data.x, data.y, data.velocity, data.angle);

    if (sprite === player) {
        stepsSound.play();
    } else {
        var animationName = null;

        if (data.velocity !== 0) {
            var angle = -((data.angle + Math.PI) % (2 * Math.PI) - Math.PI);
            var degrees45 = Math.PI / 4;
            var degrees135 = degrees45 * 3;

            if ((angle >= degrees45) && (angle <= degrees135)) {
                animationName = "moveTop";
            } else if ((angle <= -degrees45) && (angle >= -degrees135)) {
                animationName = "moveBottom";
            } else if ((angle > degrees135) || (angle <= -degrees45)) {
                animationName = "moveLeft";
            } else {
                animationName = "moveRight";
            }
        }

        animatePlayerMove(sprite, animationName);
    }
}

function stopPlayerSprite(sprite, x, y) {
    sprite.customVelocity.setTo(0, 0);
    sprite.position.set(
        x - sprite.width / 2,
        y - sprite.height / 2);
}

function getPlayer(id) {
    if (id === playerId) {
        return player;
    } else {
        return enemiesMap.get(id);
    }
}

function handlePlayerStopped(data) {
    var sprite = getPlayer(data.id);

    if (!sprite) {
        return
    }

    stopPlayerSprite(sprite, data.x, data.y);

    if (sprite === player) {
        stepsSound.stop();
    } else {
        animatePlayerMove(sprite, null);
    }
}

function handleEnemyConnected(data) {
    var enemySprite = createPlayerSprite(data.id, data.x, data.y, data.name, data.skin, '#d00000');
    enemiesMap.set(data.id, enemySprite);
}

function handleEnemyDisconnected(data) {
    var enemySprite = enemiesMap.get(data.id);
    if (enemySprite) {
        enemySprite.destroy();
    }

    enemiesMap.delete(data.id);
    removeFromArray(movableObjects, enemySprite);

    scoresMap.get(data.id).destroy();
    scoresMap.delete(data.id);

    refreshScoreList();
}

function handleSnowballChanged(data) {
    var snowball = snowballMap.get(data.id);

    if (!snowball) {
        snowball = snowballs.getFirstDead();
        snowballMap.set(data.id, snowball);
        snowball.reset(0, 0);
    }

    if (data.deleted) {
        snowballMap.delete(data.id);
        snowball.customVelocity.setTo(0, 0);

        snowball.loadTexture('snowball_splash');
        snowball.scale.setTo(0.5, 0.5);

        snowball.animations.add('explosion');
        snowball.animations.play('explosion', 70, false, true);

    } else {
        if (snowball.texture.key !== 'snowball') {
            snowball.loadTexture('snowball');
            snowball.scale.setTo(1, 1);
        }

        game.physics.arcade.velocityFromRotation(
            data.angle, data.velocity * 7.92, snowball.customVelocity
        );
    }

    snowball.position.set(data.x, data.y);
}

function handlePlayerScoreChanged(data) {
    var player = getPlayer(data.playerId);
    if (!player) {
        return;
    }

    player.model.score(data.newScore);
}

function handlePlayerScored(data) {
    var player = getPlayer(data.playerId);
    if (!player) {
        return;
    }

    var deltaText = data.scoreDelta > 0 ? '+' + data.scoreDelta : data.scoreDelta;

    var deltaLabel = game.add.text(0, 0, deltaText, {
        font: '16px Arial',
        fontWeight: 'bold',
        fill: (data.scoreDelta > 0) ? '#00A000' : '#C00000',
        stroke: '#404040',
        strokeThickness: 1
    });

    deltaLabel.centerX = player.centerX;
    deltaLabel.centerY = player.centerY + 16;

    var labelTween = this.game.add.tween(deltaLabel).to({
        y: deltaLabel.y + 48
    }, 1500, Phaser.Easing.Quadratic.Out, true);
    labelTween.onComplete.add(function () {
        this.destroy();
    }, deltaLabel);
}

function handleSnowballCountChanged(data) {
    player.model.snowballsCount(data.newCount);
}

function refreshScoreList(newPlayer) {
    var sortedPlayers = Array.from(enemiesMap.values());
    if (player) {
        sortedPlayers.push(player);
    }
    if (newPlayer) {
        sortedPlayers.push(newPlayer);
    }

    sortedPlayers.sort(function (a, b) {
        return b.model.score() - a.model.score();
    });

    var y = 16;
    sortedPlayers.forEach(function (value) {
        var label = scoresMap.get(value.model.id);
        label.cameraOffset.y = y;

        y += label.height + 8;
    });
}

function updatePlayerZIndex(value) {
    var minSprite = value;
    var maxSprite = value;

    for (i = 0; i < trees.length; i++) {
        var tree = trees[i];
        var treeBottom = tree.bottom - 40;

        if (value.bottom < treeBottom) {
            maxSprite = tree;
            break;
        } else {
            minSprite = tree;
        }
    }

    if (value.z < minSprite.z) {
        while (value.z < minSprite.z) {
            value.moveUp();
        }
    } else if (value.z > maxSprite.z) {
        while (value.z > maxSprite.z) {
            value.moveDown();
        }
    }
}

var lastTime;

function update() {
    var currentTime = new Date().getTime();
    if (!lastTime) {
        lastTime = currentTime - game.time.elapsed / 1000.;
    }

    var deltaTime = (currentTime - lastTime) / 1000.;
    lastTime = currentTime;

    movableObjects.forEach(function (object) {
        var velocity = object.customVelocity;
        if (velocity && object.body) {
            if (velocity.x !== 0) {
                object.body.x += velocity.x * deltaTime;
            }
            if (velocity.y !== 0) {
                object.body.y += velocity.y * deltaTime;
            }
        }
    });

    if (mockServer) {
        updateMock();
    }

    var players = Array.from(enemiesMap.values());
    if (player) {
        players.push(player);
    }
    players.forEach(function (playerSprite) {
        updatePlayerZIndex(playerSprite);

        trees.forEach(function (tree) {
            game.physics.arcade.collide(playerSprite, tree.trunk);
        });
    });

    trees.forEach(function (tree) {
        tree.mustHide = false;
        for (i = 0; i < players.length; i++) {
            var playerSprite = players[i];
            game.physics.arcade.overlap(tree.head, playerSprite, hideTree, null, this);
            if (tree.mustHide) {
                break;
            }
        }

        if (!tree.mustHide && (tree.alpha !== 1)) {
            tree.alpha = 1;
        }
    });

    if (!mockServer) {
        trees.forEach(function (tree) {
            game.physics.arcade.overlap(tree.trunk, snowballs, destroySnowballOnCollide, null, this);
        });
    }
}

function hideTree(treeHead, unit) {
    var tree = treeHead.parent;
    tree.alpha = 0.4;
    tree.mustHide = true;
}

function destroySnowballOnCollide(target, snowball) {
    snowball.kill();
}

function render() {
    /*    var i = 0;
        enemiesMap.forEach(function (value, key) {
            game.debug.bodyInfo(value, 32, 32 + i * 112);
            i++;
        });
    */

    /*   var i = 0;
        snowballMap.forEach(function (value, key) {
            game.debug.bodyInfo(value, 32, 32 + i * 112);
            i++;
        });*/

    /*        if (player) {
                game.debug.body(player);
                game.debug.bodyInfo(player, 32, 32 + i * 112);
            }*/

    /*
            enemiesMap.forEach(function (value) {
                game.debug.body(value);
            });

            snowballMap.forEach(function (value) {
                game.debug.body(value);
            });*/

    /*
        trees.forEach(function (value) {
            game.debug.body(value.head);
            game.debug.body(value.trunk);
        });
    */

    game.debug.gameInfo(window.innerWidth - 300, 16);
    game.debug.gameTimeInfo(window.innerWidth - 300, 160);
}

function removeFromArray(array, element) {
    var index = array.indexOf(element);
    if (index > -1) {
        array.splice(index, 1);
    }
}

function mathRound(value, decimalPlaces) {
    if (decimalPlaces <= 0) {
        return Math.round(value);
    }

    var divider = Math.pow(10, Math.round(decimalPlaces));

    return Math.round(value * divider) / divider;
}