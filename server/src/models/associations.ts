import Robot from './Robot';
import Run from './Run';

export default function setupAssociations() {
  Run.belongsTo(Robot, { foreignKey: 'robotId' });
  Robot.hasMany(Run, { foreignKey: 'robotId' });
}
