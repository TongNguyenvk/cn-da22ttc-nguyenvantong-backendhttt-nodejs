// backend/src/scripts/cleanupTempMedia.js
const { MediaFile } = require('../models');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

/**
 * Cleanup temporary media files older than 24 hours
 * Run this script via cron job: 0 0 * * * (daily at midnight)
 */
async function cleanupTempMedia() {
    try {
        console.log('[Cleanup] Starting temp media cleanup...');
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Find all pending media older than 24 hours
        const oldMedia = await MediaFile.findAll({
            where: {
                owner_type: 'pending',
                createdAt: {
                    [Op.lt]: oneDayAgo
                }
            }
        });
        
        console.log(`[Cleanup] Found ${oldMedia.length} old temp media files`);
        
        let deletedCount = 0;
        
        for (const media of oldMedia) {
            try {
                // Delete physical file
                if (fs.existsSync(media.file_path)) {
                    fs.unlinkSync(media.file_path);
                    console.log(`[Cleanup] Deleted file: ${media.file_path}`);
                }
                
                // Delete database record
                await media.destroy();
                deletedCount++;
                
            } catch (err) {
                console.error(`[Cleanup] Error deleting media ${media.media_id}:`, err.message);
            }
        }
        
        console.log(`[Cleanup] Successfully deleted ${deletedCount} temp media files`);
        
        // Also cleanup empty temp directories
        const tempDir = path.join(process.cwd(), 'uploads', 'temp');
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            if (files.length === 0) {
                console.log('[Cleanup] Temp directory is empty');
            } else {
                console.log(`[Cleanup] ${files.length} files remaining in temp directory`);
            }
        }
        
    } catch (error) {
        console.error('[Cleanup] Error during cleanup:', error);
    }
}

// Run if called directly
if (require.main === module) {
    cleanupTempMedia()
        .then(() => {
            console.log('[Cleanup] Cleanup completed');
            process.exit(0);
        })
        .catch(err => {
            console.error('[Cleanup] Cleanup failed:', err);
            process.exit(1);
        });
}

module.exports = cleanupTempMedia;
