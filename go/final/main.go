package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	oteltrace "go.opentelemetry.io/otel/trace"
)

var tracer = otel.Tracer("go-server")

type apiResponse struct {
	Activity      string  `json:"activity"`
	Accessibility float32 `json:"accessibility"`
	Type          string  `json:"type"`
	Participants  int     `json:"participants"`
	Price         float32 `json:"price"`
}

func main() {
	ctx := context.Background()
	InitOpenTelemetry(ctx)
	router := gin.New()
	router.Use(otelgin.Middleware("go-server"))
	router.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "hello world!")
	})
	router.POST("/getActivity", handleForm)

	router.Run()
}

func handleForm(c *gin.Context) {
	formType := c.PostForm("type")
	activity, err := getActivityWithParams(c.Request.Context(), formType)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
	}
	c.JSON(http.StatusOK, activity)
}

func getActivityWithParams(ctx context.Context, t string) (apiResponse, error) {
	_, span := tracer.Start(ctx, "getActivityWithParams", oteltrace.WithAttributes(attribute.String("activityType", t)))
	defer span.End()
	activityResponse := apiResponse{}
	url := fmt.Sprintf("https://www.boredapi.com/api/activity?type=%s", t)
	c := http.Client{}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		span.AddEvent(err.Error())
		return activityResponse, err
	}
	req.Header.Set("User-Agent", "otel-tutorial")
	res, err := c.Do(req)
	if err != nil {
		span.AddEvent(err.Error())
		return activityResponse, err
	}
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		span.AddEvent(err.Error())
		return activityResponse, err
	}
	err = json.Unmarshal(body, &activityResponse)
	if err != nil {
		span.AddEvent(err.Error())
		return activityResponse, err
	}

	return activityResponse, nil
}
