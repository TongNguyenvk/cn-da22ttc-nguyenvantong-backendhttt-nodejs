'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class NameEffect extends Model {
        static associate(models) {
            // Associations
            NameEffect.hasMany(models.UserInventory, {
                foreignKey: 'item_id',
                scope: { item_type: 'NAME_EFFECT' },
                as: 'UserInventories'
            });
            // Note: equipped_name_effect_id column removed from UserCustomization table
            // NameEffect system deprecated - users only equip avatars now
        }

        /**
         * Get all available name effects
         * @returns {Array<NameEffect>}
         */
        static async getAvailableNameEffects() {
            return await NameEffect.findAll({
                where: { is_active: true },
                order: [['unlock_level', 'ASC'], ['sort_order', 'ASC']]
            });
        }

        /**
         * Get name effects by tier
         * @param {string} tierName - Tier name (Onyx, Sapphire, Ruby, etc.)
         * @returns {Array<NameEffect>}
         */
        static async getNameEffectsByTier(tierName) {
            return await NameEffect.findAll({
                where: {
                    tier_name: tierName,
                    is_active: true
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get name effects unlockable by user level
         * @param {number} userLevel - User's current level
         * @returns {Array<NameEffect>}
         */
        static async getUnlockableNameEffectsByLevel(userLevel) {
            return await NameEffect.findAll({
                where: {
                    unlock_level: {
                        [sequelize.Sequelize.Op.lte]: userLevel
                    },
                    is_active: true
                },
                order: [['unlock_level', 'ASC']]
            });
        }

        /**
         * Get name effect for specific level
         * @param {number} userLevel - User's current level
         * @returns {NameEffect|null}
         */
        static async getNameEffectForLevel(userLevel) {
            return await NameEffect.findOne({
                where: {
                    unlock_level: {
                        [sequelize.Sequelize.Op.lte]: userLevel
                    },
                    is_active: true
                },
                order: [['unlock_level', 'DESC']] // Get the highest level effect available
            });
        }

        /**
         * Check if name effect can be unlocked by user
         * @param {number} userLevel - User's current level
         * @returns {boolean}
         */
        canBeUnlockedBy(userLevel) {
            if (!this.is_active) return false;
            return userLevel >= this.unlock_level;
        }

        /**
         * Get unlock description
         * @returns {string}
         */
        getUnlockDescription() {
            return `Mở khóa ở cấp độ ${this.unlock_level} (Tầng ${this.tier_name})`;
        }

        /**
         * Get tier color
         * @returns {string}
         */
        getTierColor() {
            const tierColors = {
                'Onyx': '#353839',      // Dark Gray
                'Sapphire': '#0f52ba',  // Sapphire Blue
                'Ruby': '#e0115f',      // Ruby Red
                'Amethyst': '#9966cc',  // Amethyst Purple
                'Master': '#ff6347'     // Master Orange-Red
            };
            return tierColors[this.tier_name] || '#9ca3af';
        }

        /**
         * Get tier display name
         * @returns {string}
         */
        getTierDisplayName() {
            const tierNames = {
                'Onyx': 'Onyx',
                'Sapphire': 'Sapphire',
                'Ruby': 'Ruby',
                'Amethyst': 'Amethyst',
                'Master': 'Master'
            };
            return tierNames[this.tier_name] || 'Không Xác Định';
        }

        /**
         * Get CSS class name for frontend
         * @returns {string}
         */
        getCSSClassName() {
            return this.css_class || '';
        }

        /**
         * Get CSS style object (deprecated - use CSS class instead)
         * @returns {Object}
         */
        getCSSStyleObject() {
            // Frontend should use CSS classes instead of inline styles
            console.warn('getCSSStyleObject is deprecated. Use getCSSClassName() and define CSS classes in frontend.');

            if (!this.css_style) return {};

            try {
                // Parse CSS style string into object
                const styles = {};
                this.css_style.split(';').forEach(style => {
                    const [property, value] = style.split(':').map(s => s.trim());
                    if (property && value) {
                        // Convert CSS property to camelCase for React/JS
                        const camelProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                        styles[camelProperty] = value;
                    }
                });
                return styles;
            } catch (error) {
                console.error('Error parsing CSS style:', error);
                return {};
            }
        }

        /**
         * Check if this is a premium name effect
         * @returns {boolean}
         */
        isPremium() {
            return ['Ruby', 'Amethyst', 'Master'].includes(this.tier_name);
        }

        /**
         * Check if this is an animated effect
         * @returns {boolean}
         */
        isAnimated() {
            // Check if CSS class name suggests animation
            const animatedClasses = ['wave', 'fire', 'electric', 'magic', 'cosmic', 'rainbow', 'divine', 'mythical', 'infinite'];
            return animatedClasses.some(keyword => this.css_class && this.css_class.includes(keyword));
        }

        /**
         * Get effect preview HTML for frontend
         * @param {string} userName - User name to preview
         * @returns {string}
         */
        getPreviewHTML(userName = 'Tên Người Chơi') {
            const className = this.css_class || '';
            return `<span class="${className}">${userName}</span>`;
        }

        /**
         * Get effect data for frontend integration
         * @returns {Object}
         */
        getForFrontend() {
            return {
                effect_id: this.effect_id,
                effect_name: this.effect_name,
                effect_code: this.effect_code,
                description: this.description,
                css_class: this.css_class,
                tier_name: this.tier_name,
                unlock_level: this.unlock_level,
                is_animated: this.isAnimated(),
                is_premium: this.isPremium(),
                tier_color: this.getTierColor(),
                preview_html: this.getPreviewHTML()
            };
        }

        /**
         * Get formatted name effect info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                effect_id: this.effect_id,
                effect_name: this.effect_name,
                effect_code: this.effect_code,
                description: this.description,
                css_class: this.css_class, // Main field for frontend
                tier_name: this.tier_name,
                tier_display: this.getTierDisplayName(),
                tier_color: this.getTierColor(),
                unlock_level: this.unlock_level,
                unlock_description: this.getUnlockDescription(),
                is_premium: this.isPremium(),
                is_animated: this.isAnimated(),
                preview_html: this.getPreviewHTML(),
                is_active: this.is_active,
                sort_order: this.sort_order
            };
        }
    }

    NameEffect.init(
        {
            effect_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            effect_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên hiệu ứng'
            },
            effect_code: {
                type: DataTypes.STRING(20),
                allowNull: false,
                unique: true,
                comment: 'Mã định danh hiệu ứng'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả hiệu ứng'
            },
            css_class: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'CSS class cho hiệu ứng'
            },
            css_style: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'CSS style cho hiệu ứng'
            },
            tier_name: {
                type: DataTypes.STRING(20),
                allowNull: false,
                comment: 'Tên tầng cấp độ'
            },
            unlock_level: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'Cấp độ mở khóa'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: 'Trạng thái hoạt động'
            },
            sort_order: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Thứ tự sắp xếp'
            }
        },
        {
            sequelize,
            modelName: 'NameEffect',
            tableName: 'NameEffects',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    fields: ['tier_name']
                },
                {
                    fields: ['unlock_level']
                },
                {
                    fields: ['is_active']
                },
                {
                    fields: ['sort_order']
                },
                {
                    fields: ['effect_code'],
                    unique: true
                }
            ]
        }
    );

    return NameEffect;
};
