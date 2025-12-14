'use strict';

const express = require('express');
const router = express.Router();
const AvatarCustomizationController = require('../controllers/avatarCustomizationController');
// const FrameShopController = require('../controllers/frameShopController'); // REMOVED: Frame system deprecated
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// AVATAR CUSTOMIZATION ROUTES
// =====================================================



router.post('/initialize',
    authenticateToken,
    AvatarCustomizationController.initializeAvatarSystem
);



router.get('/my-data',
    authenticateToken,
    AvatarCustomizationController.getUserAvatarData
);


router.get('/available-items',
    authenticateToken,
    AvatarCustomizationController.getAvailableItems
);



router.get('/inventory/:itemType',
    authenticateToken,
    AvatarCustomizationController.getUserInventoryByType
);



router.post('/equip',
    authenticateToken,
    AvatarCustomizationController.equipItem
);



router.post('/unequip',
    authenticateToken,
    AvatarCustomizationController.unequipItem
);



router.get('/customization',
    authenticateToken,
    AvatarCustomizationController.getUserCustomization
);



router.put('/customization',
    authenticateToken,
    AvatarCustomizationController.updateCustomizationSettings
);



// Route for getting display info for a specific user
router.get('/display-info/:userId',
    authenticateToken,
    AvatarCustomizationController.getUserDisplayInfo
);

// Route for getting display info for current user (no userId parameter)
router.get('/display-info',
    authenticateToken,
    AvatarCustomizationController.getUserDisplayInfo
);



router.get('/collection-progress',
    authenticateToken,
    AvatarCustomizationController.getCollectionProgress
);

// =====================================================
// BROWSING ROUTES (Public/Semi-Public)
// =====================================================

/**
 * @route   GET /api/avatar/avatars
 * @desc    Get all available avatars
 * @access  Private
 */
router.get('/avatars',
    authenticateToken,
    AvatarCustomizationController.getAllAvatars
);

// REMOVED: Frame routes - Frame system deprecated
// /**
//  * @route   GET /api/avatar/frames
//  * @desc    Get all available frames (DEPRECATED)
//  * @access  Private
//  */
// router.get('/frames',
//     authenticateToken,
//     AvatarCustomizationController.getAllFrames
// );

/**
 * @route   GET /api/avatar/emojis
 * @desc    Get all available emojis
 * @access  Private
 */
router.get('/emojis',
    authenticateToken,
    AvatarCustomizationController.getAllEmojis
);

// =====================================================
// FRAME SHOP ROUTES - REMOVED (Frame system deprecated)
// =====================================================
// router.get('/frames/shop', ...)
// router.post('/frames/purchase', ...)


module.exports = router;
