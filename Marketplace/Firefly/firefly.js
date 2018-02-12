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
        //Items in this locked from the movement engine.
        MOVEMENT_ENGINE_LOCK_KEYS = [],
        FIREFLY_ANCHOR_POINT,
        movementInterval;

    var DEFAULT_FIREFLY_VALUES = {
            extents: {min: .1, max: .4},
            velocity: {min: 0.05, max: 0.15}
        },
        HAND_STILL_FIREFLY_VALUES = {
            extents: {min: .05, max: .1},
            velocity: {min: 0.05, max: 0.15}
        },
        REPEL_VALUES = {
            velocity: {min: 2, max: 2}
        },
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


    function movementEngine(anchor, keys, values, skipLockCheck, repel) {

        debug.send({color:'red'},'ME::', JSON.stringify(MOVEMENT_ENGINE_LOCK_KEYS));
        debug.send({color:'red'},'ME::anchor->', JSON.stringify(anchor));

        for (var i = 0; i < keys.length; ++i) {




            if (MOVEMENT_ENGINE_LOCK_KEYS.indexOf(keys[i]) === -1 || repel) {

                // 50/50 chance to move this interval.
                if (randomNumber(0, 1) !== 1 && !repel) {
                    continue;
                }

                var ent = Entities.getEntityProperties(keys[i], ['position', 'orientation', 'name','velocity']);
                if (ent.name !== 'Firefly') {
                    continue;
                }

                var distanceFromAnchor = Vec3.distance(ent.position, anchor);

                var direction;
                if (repel || distanceFromAnchor < values.extents.min) {
                    direction = Vec3.subtract(ent.position, anchor);
                } else if (distanceFromAnchor > values.extents.max) {
                    direction = Vec3.subtract(anchor, ent.position);
                } else {
                    if (randomNumber(0, 1) === 1) {
                        direction = Vec3.subtract(ent.position, anchor);
                    } else {
                        direction = Vec3.subtract(anchor, ent.position);
                    }
                }


                var localUp = Quat.getUp(ent.orientation);
                var newOrientation = Quat.normalize(Quat.multiply(Quat.rotationBetween(localUp, direction), ent.orientation));


                // debug.send('Movement Engine');
                Entities.editEntity(keys[i], {orientation: newOrientation});
                //Entities.editEntity(keys[i], {velocity: randomVelocity(newOrientation, values.velocity.min, values.velocity.max, 5, 80)});

                Entities.editEntity(keys[i], {velocity: Vec3.mix(ent.velocity, randomVelocity(newOrientation, values.velocity.min, values.velocity.max, 5, 80), 0.5)});
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
        movementEngine(FIREFLY_ANCHOR_POINT, FIREFLY_ENTITY_KEYS, DEFAULT_FIREFLY_VALUES, false, false);
        movementInterval = Script.setInterval(function () {
            debug.send('me 200ms interval next');
            movementEngine(FIREFLY_ANCHOR_POINT, FIREFLY_ENTITY_KEYS, DEFAULT_FIREFLY_VALUES, false, false)
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


        var leftEntities = [],
            rightEntities = [];


        if (overMovementThresholdLeft && leftHandDist < DEFAULT_FIREFLY_VALUES.extents.max + EXTENTS_BUFFER) {
            leftEntities = Entities.findEntities(leftHandPos, .2);
        } else if (!overMovementThresholdLeft && elapsedTimeMS > 200) {
            leftEntities = Entities.findEntities(leftHandPos, .5);
        }

        if (overMovementThresholdRight && rightHandDist < DEFAULT_FIREFLY_VALUES.extents.max + EXTENTS_BUFFER) {
            rightEntities = Entities.findEntities(rightHandPos, .2);
        } else if (!overMovementThresholdRight && elapsedTimeMS > 200) {
            rightEntities = Entities.findEntities(rightHandPos, .5);
        }


        MOVEMENT_ENGINE_LOCK_KEYS = leftEntities.concat(rightEntities.filter(function (item) {
            return leftEntities.indexOf(item) === -1;
        }));



        debug.send('hw interval(s) next');
        if (overMovementThresholdLeft && leftHandDist < DEFAULT_FIREFLY_VALUES.extents.max + EXTENTS_BUFFER) {
            movementEngine(leftHandPos, leftEntities, REPEL_VALUES, true, true);
        } else if (!overMovementThresholdLeft && elapsedTimeMS > 200) {
            var leftUp = Vec3.sum(leftHandPos, Vec3.multiply(Quat.getUp(leftHandPos), .2));
            movementEngine(leftUp, leftEntities, HAND_STILL_FIREFLY_VALUES, true, false);
        }

        if (overMovementThresholdRight && rightHandDist < DEFAULT_FIREFLY_VALUES.extents.max + EXTENTS_BUFFER) {
            movementEngine(rightHandPos, rightEntities, REPEL_VALUES, true, true);
        } else if (!overMovementThresholdRight && elapsedTimeMS > 200) {
            var rightUp = Vec3.sum(rightHandPos, Vec3.multiply(Quat.getUp(rightHandPos), .2));
           // debug.send('RIGHT', JSON.stringify(rightUp),JSON.stringify(rightHandPos));
            movementEngine(rightUp, rightEntities, HAND_STILL_FIREFLY_VALUES, true, false);
        }

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