module.exports = (sequelize, DataTypes) => {
  const QuizResult = sequelize.define('QuizResult', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    file_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'files',
        key: 'id'
      }
    },
    quiz_type: {
      type: DataTypes.ENUM('comprehension', 'multiple_choice', 'true_false', 'short_answer', 'mixed'),
      allowNull: false,
      defaultValue: 'mixed'
    },
    questions: {
      type: DataTypes.JSONB,
      allowNull: false,
      // Structure: [{ question, options, correct_answer, user_answer, explanation }, ...]
    },
    user_answers: {
      type: DataTypes.JSONB,
      allowNull: false,
      // Structure: [{ question_index, answer, time_spent, confidence_level }, ...]
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0
      }
    },
    total_questions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    percentage_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: {
        min: 0,
        max: 100
      }
    },
    time_taken: {
      type: DataTypes.INTEGER,
      allowNull: false, // Time in seconds
      defaultValue: 0
    },
    difficulty_level: {
      type: DataTypes.ENUM('easy', 'medium', 'hard', 'mixed'),
      defaultValue: 'medium'
    },
    quiz_settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        time_limit: null, // null means no time limit
        randomize_questions: false,
        show_correct_answers: true,
        allow_retake: true
      }
    },
    ai_feedback: {
      type: DataTypes.TEXT,
      allowNull: true // AI-generated feedback on performance
    },
    areas_for_improvement: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [] // Topics/areas where user needs improvement
    },
    strengths: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [] // Topics/areas where user performed well
    },
    page_range: {
      type: DataTypes.JSONB,
      allowNull: true,
      // Structure: { start_page: 1, end_page: 10 } - which pages the quiz covered
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    completion_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 100.0,
      validate: {
        min: 0,
        max: 100
      }
    },
    quiz_session_id: {
      type: DataTypes.STRING,
      allowNull: true // For tracking multi-session quizzes
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [] // User-defined tags for quiz organization
    }
  }, {
    tableName: 'quiz_results',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['file_id']
      },
      {
        fields: ['quiz_type']
      },
      {
        fields: ['difficulty_level']
      },
      {
        fields: ['is_completed']
      },
      {
        fields: ['user_id', 'file_id'] // Composite index for user file quizzes
      },
      {
        fields: ['score']
      },
      {
        fields: ['percentage_score']
      },
      {
        fields: ['tags'],
        using: 'gin' // GIN index for array fields
      }
    ],
    hooks: {
      beforeSave: (quizResult) => {
        // Calculate percentage score
        if (quizResult.score !== undefined && quizResult.total_questions > 0) {
          quizResult.percentage_score = (quizResult.score / quizResult.total_questions * 100).toFixed(2);
        }
        
        // Calculate completion rate
        if (quizResult.user_answers) {
          const answeredQuestions = quizResult.user_answers.filter(answer => answer.answer !== null && answer.answer !== undefined).length;
          quizResult.completion_rate = (answeredQuestions / quizResult.total_questions * 100).toFixed(2);
          quizResult.is_completed = quizResult.completion_rate >= 100;
        }
      }
    }
  });

  // Instance methods
  QuizResult.prototype.getDetailedResults = function() {
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
        id: this.id,
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

  QuizResult.prototype.addTag = async function(tag) {
    if (!this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      await this.save();
    }
  };

  QuizResult.prototype.removeTag = async function(tag) {
    this.tags = this.tags.filter(t => t !== tag);
    await this.save();
  };

  QuizResult.prototype.updateFeedback = async function(feedback, areasForImprovement = [], strengths = []) {
    this.ai_feedback = feedback;
    this.areas_for_improvement = areasForImprovement;
    this.strengths = strengths;
    await this.save();
  };

  QuizResult.prototype.getPublicData = function() {
    return {
      id: this.id,
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
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  QuizResult.getAverageScore = async function(userId, fileId = null) {
    const whereClause = { user_id: userId, is_completed: true };
    if (fileId) whereClause.file_id = fileId;

    const results = await this.findAll({
      where: whereClause,
      attributes: ['percentage_score']
    });

    if (results.length === 0) return 0;

    const total = results.reduce((sum, result) => sum + parseFloat(result.percentage_score), 0);
    return (total / results.length).toFixed(2);
  };

  QuizResult.getProgressStats = async function(userId, fileId = null) {
    const whereClause = { user_id: userId };
    if (fileId) whereClause.file_id = fileId;

    const totalQuizzes = await this.count({ where: whereClause });
    const completedQuizzes = await this.count({ where: { ...whereClause, is_completed: true } });
    const averageScore = await this.getAverageScore(userId, fileId);

    return {
      total_quizzes: totalQuizzes,
      completed_quizzes: completedQuizzes,
      completion_rate: totalQuizzes > 0 ? (completedQuizzes / totalQuizzes * 100).toFixed(2) : 0,
      average_score: averageScore
    };
  };

  return QuizResult;
};