const mongoose = require('mongoose');

const QuizResultSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  file_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true,
    index: true
  },
  quiz_type: {
    type: String,
    enum: ['comprehension', 'multiple_choice', 'true_false', 'short_answer', 'mixed'],
    required: true,
    default: 'mixed',
    index: true
  },
  questions: {
    type: [{
      question: { type: String, required: true },
      options: { type: [String], default: [] },
      correct_answer: { type: mongoose.Schema.Types.Mixed, required: true },
      explanation: { type: String, default: null }
    }],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Quiz must have at least one question'
    }
  },
  user_answers: {
    type: [{
      question_index: { type: Number, required: true },
      answer: { type: mongoose.Schema.Types.Mixed, default: null },
      time_spent: { type: Number, default: 0 }, // in seconds
      confidence_level: { type: Number, min: 1, max: 5, default: null }
    }],
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  total_questions: {
    type: Number,
    required: true,
    min: 1
  },
  percentage_score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    index: true
  },
  time_taken: {
    type: Number,
    required: true,
    default: 0, // Time in seconds
    min: 0
  },
  difficulty_level: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'mixed'],
    default: 'medium',
    index: true
  },
  quiz_settings: {
    time_limit: { type: Number, default: null }, // null means no time limit
    randomize_questions: { type: Boolean, default: false },
    show_correct_answers: { type: Boolean, default: true },
    allow_retake: { type: Boolean, default: true }
  },
  ai_feedback: {
    type: String, // AI-generated feedback on performance
    default: null
  },
  areas_for_improvement: {
    type: [String],
    default: [] // Topics/areas where user needs improvement
  },
  strengths: {
    type: [String],
    default: [] // Topics/areas where user performed well
  },
  page_range: {
    start_page: { type: Number, min: 1, default: null },
    end_page: { type: Number, min: 1, default: null }
  },
  is_completed: {
    type: Boolean,
    default: true,
    index: true
  },
  completion_rate: {
    type: Number,
    default: 100.0,
    min: 0,
    max: 100
  },
  quiz_session_id: {
    type: String,
    default: null, // For tracking multi-session quizzes
    index: true
  },
  tags: {
    type: [String],
    default: [], // User-defined tags for quiz organization
    index: true
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  }
});

// Compound indexes for performance
QuizResultSchema.index({ user_id: 1, file_id: 1 });
QuizResultSchema.index({ user_id: 1, created_at: -1 });
QuizResultSchema.index({ file_id: 1, created_at: -1 });
QuizResultSchema.index({ user_id: 1, percentage_score: -1 });
QuizResultSchema.index({ quiz_type: 1, difficulty_level: 1 });

// Text index for search functionality
QuizResultSchema.index({
  'questions.question': 'text',
  ai_feedback: 'text',
  areas_for_improvement: 'text',
  strengths: 'text',
  tags: 'text'
});

// Pre-save middleware to calculate scores
QuizResultSchema.pre('save', function(next) {
  // Calculate percentage score
  if (this.score !== undefined && this.total_questions > 0) {
    this.percentage_score = parseFloat(((this.score / this.total_questions) * 100).toFixed(2));
  }
  
  // Calculate completion rate
  if (this.user_answers && this.user_answers.length > 0) {
    const answeredQuestions = this.user_answers.filter(answer => 
      answer.answer !== null && answer.answer !== undefined
    ).length;
    this.completion_rate = parseFloat(((answeredQuestions / this.total_questions) * 100).toFixed(2));
    this.is_completed = this.completion_rate >= 100;
  }
  
  next();
});

// Instance methods
QuizResultSchema.methods.getDetailedResults = function() {
  const correctAnswers = this.user_answers.filter((answer, index) => {
    const question = this.questions[index];
    return answer.answer === question.correct_answer;
  });

  const incorrectAnswers = this.user_answers.filter((answer, index) => {
    const question = this.questions[index];
    return answer.answer !== question.correct_answer;
  });

  return {
    quiz_info: {
      id: this._id,
      quiz_type: this.quiz_type,
      difficulty_level: this.difficulty_level,
      time_taken: this.time_taken,
      completed_at: this.created_at
    },
    performance: {
      score: this.score,
      total_questions: this.total_questions,
      percentage_score: this.percentage_score,
      completion_rate: this.completion_rate,
      correct_count: correctAnswers.length,
      incorrect_count: incorrectAnswers.length
    },
    detailed_answers: this.questions.map((question, index) => {
      const userAnswer = this.user_answers[index];
      return {
        question: question.question,
        options: question.options,
        correct_answer: question.correct_answer,
        user_answer: userAnswer?.answer,
        is_correct: userAnswer?.answer === question.correct_answer,
        time_spent: userAnswer?.time_spent || 0,
        confidence_level: userAnswer?.confidence_level,
        explanation: question.explanation
      };
    }),
    feedback: this.ai_feedback,
    areas_for_improvement: this.areas_for_improvement,
    strengths: this.strengths
  };
};

QuizResultSchema.methods.addTag = async function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return await this.save();
  }
  return this;
};

QuizResultSchema.methods.removeTag = async function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return await this.save();
};

QuizResultSchema.methods.updateFeedback = async function(feedback, areasForImprovement = [], strengths = []) {
  this.ai_feedback = feedback;
  this.areas_for_improvement = areasForImprovement;
  this.strengths = strengths;
  return await this.save();
};

QuizResultSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    quiz_type: this.quiz_type,
    score: this.score,
    total_questions: this.total_questions,
    percentage_score: this.percentage_score,
    time_taken: this.time_taken,
    difficulty_level: this.difficulty_level,
    completion_rate: this.completion_rate,
    is_completed: this.is_completed,
    areas_for_improvement: this.areas_for_improvement,
    strengths: this.strengths,
    tags: this.tags,
    page_range: this.page_range,
    created_at: this.created_at,
    updated_at: this.updated_at
  };
};

// Static methods
QuizResultSchema.statics.getAverageScore = async function(userId, fileId = null) {
  const matchQuery = { user_id: userId, is_completed: true };
  if (fileId) matchQuery.file_id = fileId;

  const results = await this.aggregate([
    { $match: matchQuery },
    { $group: { _id: null, avgScore: { $avg: '$percentage_score' } } }
  ]);

  return results.length > 0 ? parseFloat(results[0].avgScore.toFixed(2)) : 0;
};

QuizResultSchema.statics.getProgressStats = async function(userId, fileId = null) {
  const matchQuery = { user_id: userId };
  if (fileId) matchQuery.file_id = fileId;

  const totalQuizzes = await this.countDocuments(matchQuery);
  const completedQuizzes = await this.countDocuments({ ...matchQuery, is_completed: true });
  const averageScore = await this.getAverageScore(userId, fileId);

  return {
    total_quizzes: totalQuizzes,
    completed_quizzes: completedQuizzes,
    completion_rate: totalQuizzes > 0 ? parseFloat(((completedQuizzes / totalQuizzes) * 100).toFixed(2)) : 0,
    average_score: averageScore
  };
};

QuizResultSchema.statics.getPerformanceTrends = async function(userId, fileId = null, limit = 10) {
  const matchQuery = { user_id: userId, is_completed: true };
  if (fileId) matchQuery.file_id = fileId;

  return await this.find(matchQuery)
    .select('percentage_score quiz_type difficulty_level created_at')
    .sort({ created_at: -1 })
    .limit(limit);
};

module.exports = mongoose.model('QuizResult', QuizResultSchema);