package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/stdout"

	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/semconv"
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

func initOpenTelemetry() {
	ctx := context.Background()
	exporter, err := stdout.NewExporter(stdout.WithPrettyPrint())
	if err != nil {
		log.Fatalf("Failed to create stdout exporter: %v", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(semconv.ServiceNameKey.String("go-server")),
	)

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithConfig(sdktrace.Config{DefaultSampler: sdktrace.AlwaysSample()}),
		sdktrace.WithResource(res),
		sdktrace.WithBatcher(
			exporter,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(10),
		),
	)
	defer func() {
		ctx, cancel := context.WithTimeout(ctx, time.Second)
		defer cancel()
		if err := provider.Shutdown(ctx); err != nil {
			otel.Handle(err)
		}
	}()
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	log.Println("opentelemetry configured!")
}

func main() {
	initOpenTelemetry()
	router := gin.Default()
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
