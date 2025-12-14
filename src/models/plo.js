'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class PLO extends Model {
        static associate(models) {
            PLO.belongsTo(models.Program, { foreignKey: 'program_id' });
            PLO.belongsToMany(models.PO, { through: models.POsPLOs, foreignKey: 'plo_id' });
            // Quan hệ nhiều-nhiều với Subject thông qua bảng junction SubjectPLOs
            PLO.belongsToMany(models.Subject, { 
                through: models.SubjectPLO, 
                foreignKey: 'plo_id',
                otherKey: 'subject_id',
                as: 'Subjects'
            });

            // Quan hệ nhiều-nhiều với LO thông qua bảng junction LOsPLOs
            PLO.belongsToMany(models.LO, { 
                through: models.LOsPLO, 
                foreignKey: 'plo_id',
                otherKey: 'lo_id',
                as: 'LOs'
            });
        }
    }

    PLO.init(
        {
            plo_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            program_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Programs',
                    key: 'program_id',
                },
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: 'PLO',
            tableName: 'PLOs',
            timestamps: false,
            hooks: {
                // Ensure name is never null for legacy controllers that didn't send it
                beforeValidate: (plo) => {
                    if (!plo.name || String(plo.name).trim() === '') {
                        // Temporary placeholder; will be finalized after create
                        plo.name = 'PLO';
                    }
                },
                // After creation, if name wasn't provided, set it to PLO{plo_id}
                afterCreate: async (plo, options) => {
                    if (!plo || !plo.plo_id) return;
                    const currentName = String(plo.name || '').trim();
                    if (!currentName || currentName === 'PLO') {
                        await plo.update({ name: `PLO${plo.plo_id}` }, { transaction: options?.transaction });
                    }
                }
            }
        }
    );

    return PLO;
};