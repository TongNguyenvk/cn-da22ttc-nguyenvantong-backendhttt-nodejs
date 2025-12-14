const { QuizResult, sequelize } = require('../models');
const { db } = require('../config/firebase');

function computeScoreFromAnswers(answersObj) {
    const answers = Object.values(answersObj || {});
    if (!answers.length) return 0;
    const correct = answers.filter(a => a && a.is_correct).length;
    return Math.round((correct / answers.length) * 100);
}

async function finalizeAssessmentParticipant(quizId, userId) {
    return sequelize.transaction(async (t) => {
        let quizResult = await QuizResult.findOne({
            where: { quiz_id: quizId, user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        const participantSnap = await db.ref(`quiz_sessions/${quizId}/participants/${userId}`).once('value');
        const participant = participantSnap.val();
        if (!participant) {
            return { skipped: true, reason: 'participant_not_found' };
        }
        if (participant.status !== 'completed') {
            // Chỉ finalize khi đã completed ở Firebase
            return { skipped: true, reason: 'not_completed' };
        }
        const score = computeScoreFromAnswers(participant.answers || {});
        const completionTs = participant.completed_at ? new Date(participant.completed_at) : new Date();

        if (!quizResult) {
            quizResult = await QuizResult.create({
                quiz_id: quizId,
                user_id: userId,
                score,
                status: 'completed',
                completion_time: completionTs,
                update_time: new Date()
            }, { transaction: t });
            return { created: true, score };
        }
        if (quizResult.status === 'completed') {
            return { idempotent: true, score: quizResult.score };
        }
        quizResult.score = score;
        quizResult.status = 'completed';
        quizResult.completion_time = completionTs;
        quizResult.update_time = new Date();
        await quizResult.save({ transaction: t });
        return { updated: true, score };
    });
}

module.exports = { finalizeAssessmentParticipant };
