'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserCustomization extends Model {
        static associate(models) {
            UserCustomization.belongsTo(models.User, { 
                foreignKey: 'user_id', 
                as: 'User' 
            });
            
            UserCustomization.belongsTo(models.Avatar, { 
                foreignKey: 'equipped_avatar_id', 
                as: 'EquippedAvatar' 
            });
        }

        static async getUserCustomization(userId) {
            return await UserCustomization.findOne({
                where: { user_id: userId },
                include: [
                    { 
                        model: sequelize.models.Avatar,
                        as: 'EquippedAvatar',
                        required: false 
                    }
                ]
            });
        }

        static async initializeUserCustomization(userId) {
            const defaultAvatar = await sequelize.models.Avatar.findOne({
                where: { is_default: true, is_active: true },
                order: [['sort_order', 'ASC']]
            });

            return await UserCustomization.create({
                user_id: userId,
                equipped_avatar_id: defaultAvatar?.avatar_id || null,
                customization_settings: {}
            });
        }

        static async equipAvatar(userId, avatarId) {
            try {
                const ownsAvatar = await sequelize.models.UserInventory.checkUserOwnsItem(
                    userId, 'AVATAR', avatarId
                );

                if (!ownsAvatar) {
                    return false;
                }

                let customization = await UserCustomization.findOne({
                    where: { user_id: userId }
                });

                if (!customization) {
                    customization = await UserCustomization.initializeUserCustomization(userId);
                }

                await customization.update({
                    equipped_avatar_id: avatarId
                });

                return true;
            } catch (error) {
                console.error('Error equipping avatar:', error);
                throw error;
            }
        }

        static async unequipAvatar(userId) {
            try {
                const customization = await UserCustomization.findOne({
                    where: { user_id: userId }
                });

                if (!customization) {
                    return false;
                }

                const defaultAvatar = await sequelize.models.Avatar.findOne({
                    where: { is_default: true, is_active: true },
                    order: [['sort_order', 'ASC']]
                });

                await customization.update({
                    equipped_avatar_id: defaultAvatar?.avatar_id || null
                });

                return true;
            } catch (error) {
                console.error('Error unequipping avatar:', error);
                throw error;
            }
        }

        static async getCustomizationProfile(userId) {
            const customization = await UserCustomization.findOne({
                where: { user_id: userId },
                include: [
                    {
                        model: sequelize.models.Avatar,
                        as: 'EquippedAvatar',
                        required: false
                    }
                ]
            });

            if (!customization) {
                return null;
            }

            return {
                user_id: customization.user_id,
                equipped_avatar: customization.EquippedAvatar ? {
                    avatar_id: customization.EquippedAvatar.avatar_id,
                    name: customization.EquippedAvatar.name,
                    image_url: customization.EquippedAvatar.image_url,
                    rarity: customization.EquippedAvatar.rarity
                } : null,
                customization_settings: customization.customization_settings || {},
                last_updated: customization.last_updated
            };
        }

        static async updateCustomizationSettings(userId, settings) {
            try {
                let customization = await UserCustomization.findOne({
                    where: { user_id: userId }
                });

                if (!customization) {
                    customization = await UserCustomization.initializeUserCustomization(userId);
                }

                const currentSettings = customization.customization_settings || {};
                const updatedSettings = { ...currentSettings, ...settings };

                await customization.update({
                    customization_settings: updatedSettings
                });

                return true;
            } catch (error) {
                console.error('Error updating customization settings:', error);
                throw error;
            }
        }

        getFormattedInfo() {
            return {
                customization_id: this.customization_id,
                user_id: this.user_id,
                equipped_avatar_id: this.equipped_avatar_id,
                equipped_avatar: this.EquippedAvatar ? {
                    avatar_id: this.EquippedAvatar.avatar_id,
                    name: this.EquippedAvatar.name,
                    image_url: this.EquippedAvatar.image_url,
                    rarity: this.EquippedAvatar.rarity
                } : null,
                customization_settings: this.customization_settings || {},
                last_updated: this.last_updated
            };
        }
    }

    UserCustomization.init({
        customization_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        equipped_avatar_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'Avatars',
                key: 'avatar_id'
            }
        },
        customization_settings: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: {}
        },
        last_updated: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'last_updated'
        }
    }, {
        sequelize,
        modelName: 'UserCustomization',
        tableName: 'UserCustomization',
        timestamps: true,
        createdAt: false,  // No created_at in DB
        updatedAt: 'last_updated',  // Map to last_updated column
        underscored: false
    });

    return UserCustomization;
};
