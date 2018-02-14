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
        velocity = Vec3.multiplyQbyV(Quat.fromPitchYawRollDegrees(0.0, randomNumber(0, 360), 0.0), velocity);
        velocity = Vec3.multiplyQbyV(entityRot, velocity);
        return velocity;
    }


    var APP_NAME = 'Firefly',
        APP_ICON = Script.resolvePath('assets/firefly.svg'),
        APP_ICON_ACTIVE = Script.resolvePath('assets/firefly-a.svg'),
        FIREFLY_ENTITY_KEYS = [],
        FIREFLY_ANCHOR_POINT,
        movementInterval;


    var tablet = Tablet.getTablet('com.highfidelity.interface.tablet.system');

    var button = tablet.addButton({
        icon: APP_ICON,
        activeIcon: APP_ICON_ACTIVE,
        text: APP_NAME
    });


    var extents = {
        min: .2,
        max: .5
    };

    function movementEngine() {

        for (var i = 0; i < FIREFLY_ENTITY_KEYS.length; ++i) {

            //maybe move this interval.
            if (randomNumber(0, 1)) {
                var ent = Entities.getEntityProperties(FIREFLY_ENTITY_KEYS[i], ['localPosition', 'orientation']);

                var distanceFromAnchor = Vec3.distance(ent.localPosition, FIREFLY_ANCHOR_POINT);


                var direction;

                if (distanceFromAnchor < extents.min) {
                    direction = Vec3.subtract(ent.localPosition, FIREFLY_ANCHOR_POINT);

                    debug.send({color: 'green'}, 'min', JSON.stringify(direction))

                } else if (distanceFromAnchor > extents.max) {
                    direction = Vec3.subtract(FIREFLY_ANCHOR_POINT, ent.localPosition);
                    debug.send({color: 'blue'}, 'max', JSON.stringify(direction))

                } else {
                    if (randomNumber(0, 1)) {
                        direction = Vec3.subtract(ent.localPosition, FIREFLY_ANCHOR_POINT);

                        debug.send({color: 'green'}, 'min, in last else', JSON.stringify(direction))

                    } else {
                        direction = Vec3.subtract(FIREFLY_ANCHOR_POINT, ent.localPosition);
                        debug.send({color: 'blue'}, 'max, in last else', JSON.stringify(direction))
                    }
                }


                var localUp = Quat.getUp(ent.orientation);
                var newOrientation = Quat.normalize(Quat.multiply(Quat.rotationBetween(localUp, direction), ent.orientation))


                var props = {
                    velocity: randomVelocity(newOrientation, 0.1, 0.5, 5, 80),
                    orientation: newOrientation
                };
                debug.send('Movement Engine');
                Entities.editEntity(FIREFLY_ENTITY_KEYS[i], {orientation: props.orientation});
                Entities.editEntity(FIREFLY_ENTITY_KEYS[i], {velocity: props.velocity});
            }
        }


    }

    function createFireFlys() {

        var makeFireflyNum = randomNumber(10, 20);

        needsLocalEntity = !(Entities.canRezTmp() || Entities.canRez());


        var orientationRotated45Degrees = Quat.angleAxis(45, Quat.getUp(MyAvatar.orientation));

        var inverseOrientationRotated45Degrees = Quat.inverse(orientationRotated45Degrees);

        var forward = Vec3.sum(MyAvatar.position, Vec3.multiply(Quat.getForward(MyAvatar.orientation), 0.5));

        //local position relative to avatar offset .5 meters forward .2 meters up and rotated 45 degrees
        FIREFLY_ANCHOR_POINT = Vec3.multiplyQbyV(inverseOrientationRotated45Degrees,
            Vec3.subtract(Vec3.sum(MyAvatar.position, {x: 0, y: .2, z: 0}), forward));

        debug.send('FIREFLY_ANCHOR_POINT', JSON.stringify(FIREFLY_ANCHOR_POINT));
        var props = {
            type: 'Model',
            parentID: MyAvatar.sessionUUID,
            modelURL: Script.resolvePath('assets/sphere-firefly-17.fbx'),
            lifetime: '360',
            name: 'Firefly',
            dimensions: {z: 0.05, y: 0.05, x: 0.05},
            //script: 'https://binaryrelay.com/files/public-docs/hifi/meter/applauseOmeter.js',
            localPosition: FIREFLY_ANCHOR_POINT
        };

        for (var i = 0; i < makeFireflyNum; ++i) {
            Script.setTimeout(function () {
                FIREFLY_ENTITY_KEYS.push(Entities.addEntity(props, needsLocalEntity));
            }, 100 * makeFireflyNum);

            if (i === makeFireflyNum - 1) {
                movementInterval = Script.setInterval(movementEngine, 200);
            }
        }

    }

    function removeFireFlys() {
        FIREFLY_ENTITY_KEYS.forEach(function (item) {
            Entities.deleteEntity(item);
        });
        FIREFLY_ENTITY_KEYS = [];
    }

    var PUSH_AWAY_ZONE = 0.1,
        MIN_DISTANCE = 0.1,
        MOVEMENT_THRESHOLD = .01,
        lastDist = {
            left: null,
            right: null
        };

    function handWatcher(deltaTime) {

        var leftHandPos = MyAvatar.getLeftHandPose(),
            rightHandPos = MyAvatar.getRightHandPose();

        var overMovementThreshHoldLeft = (MOVEMENT_THRESHOLD > Math.abs(Vec3.distance(lastDist, leftHandPos)));
        var overMovementThreshHoldRight = (MOVEMENT_THRESHOLD > Math.abs(Vec3.distance(lastDist, leftHandPos)));

        var leftHandDist = Vec3.distance(leftHandPos, FIREFLY_ANCHOR_POINT);
        var rightHandDist = Vec3.distance(rightHandPos, FIREFLY_ANCHOR_POINT);


        if (overMovementThreshHoldLeft && leftHandDist > MIN_DISTANCE) {


        }

        if (overMovementThreshHoldRight && rightHandDist > MIN_DISTANCE) {

        }

        lastDist.left = leftHandDist;
        lastDist.right = rightHandDist;

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
            removeFireFlys()
            Script.update.disconnect(handWatcher);
            Script.clearInterval(movementInterval);
        }
        button.editProperties({isActive: _switch});

        _switch = !_switch;
    }

    button.clicked.connect(buttonSwitch);


    Script.scriptEnding.connect(clean);

}());