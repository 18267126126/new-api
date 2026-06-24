package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// TokenUsageDatum aggregates token consumption for dashboard charts.
type TokenUsageDatum struct {
	TokenName string `json:"token_name"`
	CreatedAt int64  `json:"created_at"`
	TokenUsed int    `json:"token_used"`
}

func tokenUsedSumSelectExpr() string {
	if common.UsingMySQL {
		return "ifnull(sum(prompt_tokens), 0) + ifnull(sum(completion_tokens), 0)"
	}
	return "sum(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0))"
}

func applyTokenUsageLogFilters(query *gorm.DB, userId int, username string, startTime int64, endTime int64) *gorm.DB {
	query = query.Where("type = ?", LogTypeConsume)
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if username != "" {
		query = query.Where("username = ?", username)
	}
	if startTime > 0 {
		query = query.Where("created_at >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("created_at <= ?", endTime)
	}
	return query
}

func GetTokenUsageGroupByTokenName(userId int, username string, startTime int64, endTime int64) ([]*TokenUsageDatum, error) {
	bucketExpr := rankingBucketExpr(3600)
	tokenSumExpr := tokenUsedSumSelectExpr()
	var rows []*TokenUsageDatum
	query := LOG_DB.Table("logs").
		Select(fmt.Sprintf("token_name, %s as created_at, %s as token_used", bucketExpr, tokenSumExpr)).
		Where("token_name <> ''").
		Group(fmt.Sprintf("token_name, %s", bucketExpr)).
		Having(fmt.Sprintf("%s > 0", tokenSumExpr))
	query = applyTokenUsageLogFilters(query, userId, username, startTime, endTime)
	err := query.Order("created_at ASC").Find(&rows).Error
	return rows, err
}
