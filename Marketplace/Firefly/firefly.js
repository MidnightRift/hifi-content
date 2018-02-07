'use strict';

(function () {
    var debug = Script.require('https://debug.midnightrift.com/files/hifi/debug.min.js');
    debug.connect('midnight-one');

    Script.include("/~/system/libraries/controllers.js");

    var needsLocalEntity;

    function randomNumber(start, end) {
        return Math.floor(Math.random() * (end - start + 1)) + start;
    }

    function randomVelocity(entityRot, minSpeed, maxSpeed, minAngle, maxAngle) {
        var SPEED = randomNumber(minSpeed, maxSpeed);  // m/s
        var ANGLE = randomNumber(minAngle, maxAngle);

        var velocity = Vec3.multiply(SPEED, Vec3.UNIT_Y);
        velocity = Vec3.multiplyQbyV(Quat.fromPitchYawRollDegrees(ANGLE, 0.0, 0.0), velocity);
        velocity = Vec3.multiplyQbyV(Quat.fromPitchYawRollDegrees(0.0, randomNumber(0, 180), 0.0), velocity);
        velocity = Vec3.multiplyQbyV(entityRot, velocity);
        return velocity;
    }


    var APP_NAME = 'Firefly',
        APP_ICON = Script.resolvePath('assets/firefly.svg'),
        APP_ICON_ACTIVE = Script.resolvePath('assets/firefly-a.svg'),
        FIREFLY_ENTITY_KEYS = [],
        //Items in this are locked from the movement engine.
        MOVEMENT_ENGINE_LOCK_KEYS = [],
        FIREFLY_ANCHOR_POINT,
        movementInterval;

    var DEFAULT_FIREFLY_EXTENTS = {min: .1, max: .2},
        HAND_STILL_FIREFLY_EXTENTS = {min: .05, max: .1},
        EXTENTS_BUFFER = 0.05,
        MOVEMENT_THRESHOLD = .01,
        lastPosition = {
            left: null,
            right: null
        };


    var tablet = Tablet.getTablet('com.highfidelity.interface.tablet.system');

    var button = tablet.addButton({
        icon: APP_ICON,
        activeIcon: APP_ICON_ACTIVE,
        text: APP_NAME
    });


    function movementEngine(anchor, keys, extents, skipLockCheck) {


        for (var i = 0; i < keys.length; ++i) {

            if (MOVEMENT_ENGINE_LOCK_KEYS.indexOf(keys[i]) === -1 || skipLockCheck) {

                // 50/50 chance to move this interval.
                if (randomNumber(0, 1) !== 1) {
                    continue;
                }

                var ent = Entities.getEntityProperties(keys[i], ['position', 'orientation','name']);

                if (ent.name !== 'Firefly') {
                    continue;
                }


                var distanceFromAnchor = Vec3.distance(ent.position, anchor);

                var direction;

                if (distanceFromAnchor < extents.min) {
                    direction = Vec3.subtract(ent.position, anchor);

                    //   debug.send({color: 'green'}, 'min', JSON.stringify(direction))
                } else if (distanceFromAnchor > extents.max) {
                    direction = Vec3.subtract(anchor, ent.position);
                    //    debug.send({color: 'blue'}, 'max', JSON.stringify(direction))

                } else {
                    if (randomNumber(0, 1) === 1) {
                        direction = Vec3.subtract(ent.position, anchor);

                        //  debug.send({color: 'green'}, 'min, in last else', JSON.stringify(direction))

                    } else {
                        direction = Vec3.subtract(anchor, ent.position);
                        //  debug.send({color: 'blue'}, 'max, in last else', JSON.stringify(direction))
                    }
                }


                var localUp = Quat.getUp(ent.orientation);
                var newOrientation = Quat.normalize(Quat.multiply(Quat.rotationBetween(localUp, direction), ent.orientation));


                // debug.send('Movement Engine');
                Entities.editEntity(keys[i], {orientation: newOrientation});
                Entities.editEntity(keys[i], {velocity: randomVelocity(newOrientation, 0.05, 0.15, 5, 80)});
            }
        }


    }

    function createFireFlys() {

        var makeFireflyNum = randomNumber(20, 40);

        needsLocalEntity = !(Entities.canRezTmp() || Entities.canRez());

        var orientationRotated45Degrees = Quat.angleAxis(45, Quat.getUp(MyAvatar.orientation));

        var forward = Vec3.sum(MyAvatar.position, Vec3.multiply(Quat.getForward(orientationRotated45Degrees), 1));


        FIREFLY_ANCHOR_POINT = Vec3.sum(forward, Vec3.multiply(Quat.getUp(orientationRotated45Degrees), 0.5));


        for (var i = 0; i < makeFireflyNum; ++i) {
            var props = {
                type: 'Model',
                modelURL: Script.resolvePath('assets/sphere-firefly-17.fbx'),
                lifetime: '360',
                name: 'Firefly',
                dimensions: {z: 0.02, y: 0.02, x: 0.02},
                position: Vec3.sum(FIREFLY_ANCHOR_POINT,
                    {x: (randomNumber(20, 50) / 100), y: (randomNumber(20, 50) / 100), z: (randomNumber(20, 50) / 100)})
            };

            FIREFLY_ENTITY_KEYS.push(Entities.addEntity(props, needsLocalEntity));
        }
        movementEngine(FIREFLY_ANCHOR_POINT, FIREFLY_ENTITY_KEYS, DEFAULT_FIREFLY_EXTENTS, false);
        movementInterval = Script.setInterval(function () {
            movementEngine(FIREFLY_ANCHOR_POINT, FIREFLY_ENTITY_KEYS, DEFAULT_FIREFLY_EXTENTS, false)
        }, 200);

    }

    function removeFireFlys() {
        FIREFLY_ENTITY_KEYS.forEach(function (item) {
            Entities.deleteEntity(item);
        });
        FIREFLY_ENTITY_KEYS = [];
    }

    var elapsedTimeMS = 0;

    function handWatcher(deltaTime) {
        elapsedTimeMS += deltaTime * 1000;

        var leftHandPos = getControllerWorldLocation(Controller.Standard.LeftHand, true).position,
            rightHandPos = getControllerWorldLocation(Controller.Standard.RightHand, true).position;


        var overMovementThresholdLeft = (MOVEMENT_THRESHOLD < Vec3.distance(lastPosition.left, leftHandPos));
        var overMovementThresholdRight = (MOVEMENT_THRESHOLD < Vec3.distance(lastPosition.right, rightHandPos));

        //debug.send({color: 'blue'}, JSON.stringify(lastPosition.left), JSON.stringify(leftHandPos));
        //debug.send({color: 'purple'}, JSON.stringify(lastPosition.right), JSON.stringify(rightHandPos));
        var leftHandDist = Vec3.distance(leftHandPos, FIREFLY_ANCHOR_POINT);
        var rightHandDist = Vec3.distance(rightHandPos, FIREFLY_ANCHOR_POINT);


        var direction,
            ent,
            localUp,
            newOrientation,
            leftEntities = [],
            rightEntities = [];


        if (overMovementThresholdLeft && leftHandDist < DEFAULT_FIREFLY_EXTENTS.max + EXTENTS_BUFFER) {
            leftEntities = Entities.findEntities(leftHandPos, .2);
            for (var i = 0; i < leftEntities.length; ++i) {
                ent = Entities.getEntityProperties(leftEntities[i], ['position', 'orientation', 'name']);
                direction = Vec3.subtract(ent.position, leftHandPos);
                localUp = Quat.getUp(ent.orientation);
                newOrientation = Quat.normalize(Quat.multiply(Quat.rotationBetween(localUp, direction), ent.orientation));
                if (ent.name !== 'Firefly') {
                    continue;
                }

                if (MOVEMENT_ENGINE_LOCK_KEYS.indexOf(leftEntities[i]) === -1) {
                    MOVEMENT_ENGINE_LOCK_KEYS.push(leftEntities[i]);
                }

                // debug.send('Repel left', JSON.stringify(leftEntities));
                Entities.editEntity(leftEntities[i], {orientation: newOrientation});
                Entities.editEntity(leftEntities[i], {velocity: randomVelocity(newOrientation, 0.1, 0.15, 5, 80)});
            }
        } else if (!overMovementThresholdLeft && leftHandDist < DEFAULT_FIREFLY_EXTENTS.max + EXTENTS_BUFFER
            && elapsedTimeMS > 200) {
            leftEntities = Entities.findEntities(leftHandPos, .3);

            for (var i = 0; i < leftEntities.length; ++i) {
                ent = Entities.getEntityProperties(leftEntities[i], ['position', 'orientation', 'name']);
                if (ent.name !== 'Firefly') {
                    continue;
                }

                if (MOVEMENT_ENGINE_LOCK_KEYS.indexOf(leftEntities[i]) === -1) {
                    MOVEMENT_ENGINE_LOCK_KEYS.push(leftEntities[i]);
                }

            }

            var leftUp = Vec3.sum(leftHandPos, Vec3.multiply(Quat.getUp(leftHandPos), .5));
            debug.send('LEFT', JSON.stringify(leftUp), JSON.stringify(leftHandPos));
            movementEngine(leftUp, leftEntities, HAND_STILL_FIREFLY_EXTENTS, true);
        }

        if (overMovementThresholdRight && rightHandDist < DEFAULT_FIREFLY_EXTENTS.max + EXTENTS_BUFFER) {
            rightEntities = Entities.findEntities(rightHandPos, .2);

            for (var j = 0; j < rightEntities.length; ++j) {
                ent = Entities.getEntityProperties(rightEntities[j], ['position', 'orientation', 'name']);
                if (ent.name !== 'Firefly') {
                    continue;
                }
                direction = Vec3.subtract(ent.position, rightHandPos);
                localUp = Quat.getUp(ent.orientation);
                newOrientation = Quat.normalize(Quat.multiply(Quat.rotationBetween(localUp, direction), ent.orientation));

                if (MOVEMENT_ENGINE_LOCK_KEYS.indexOf(rightEntities[j]) === -1) {
                    MOVEMENT_ENGINE_LOCK_KEYS.push(rightEntities[j]);
                }
                debug.send('RIGHT REPEL', MOVEMENT_ENGINE_LOCK_KEYS);
                Entities.editEntity(rightEntities[j], {orientation: newOrientation});
                Entities.editEntity(rightEntities[j], {velocity: randomVelocity(newOrientation, 2, 2, 5, 80)});

            }
        } else if (!overMovementThresholdRight && rightHandDist < DEFAULT_FIREFLY_EXTENTS.max + EXTENTS_BUFFER
            && elapsedTimeMS > 200) {
            rightEntities = Entities.findEntities(rightHandPos, .3);

            for (var j = 0; j < rightEntities.length; ++j) {
                ent = Entities.getEntityProperties(rightEntities[j], ['position', 'orientation', 'name']);
                if (ent.name !== 'Firefly') {
                    continue;
                }
                if (MOVEMENT_ENGINE_LOCK_KEYS.indexOf(rightEntities[j]) === -1) {
                    MOVEMENT_ENGINE_LOCK_KEYS.push(rightEntities[j]);
                }
            }

            var rightUp = Vec3.sum(rightHandPos, Vec3.multiply(Quat.getUp(rightHandPos), .5));
            debug.send('RIGHT', JSON.stringify(rightUp), JSON.stringify(rightHandPos));
            movementEngine(rightUp, rightEntities, HAND_STILL_FIREFLY_EXTENTS, true);
        }


        var bothLeftAndRight = leftEntities.concat(rightEntities);

        MOVEMENT_ENGINE_LOCK_KEYS = bothLeftAndRight.filter(function (item) {
            return MOVEMENT_ENGINE_LOCK_KEYS.indexOf(item) === -1;
        });


        if (elapsedTimeMS > 200) {
            elapsedTimeMS = 0;
        }

        lastPosition.left = leftHandPos;
        lastPosition.right = rightHandPos;

    }


    var _switch = true;

    function clean() {
        tablet.removeButton(button);
        Script.update.disconnect(handWatcher);
        Script.clearInterval(movementInterval);
    }


    function buttonSwitch() {
        if (_switch) {
            createFireFlys();
            Script.update.connect(handWatcher);
        } else {
            removeFireFlys();
            Script.update.disconnect(handWatcher);
            Script.clearInterval(movementInterval);
        }
        button.editProperties({isActive: _switch});

        _switch = !_switch;
    }

    button.clicked.connect(buttonSwitch);


    Script.scriptEnding.connect(clean);

}());