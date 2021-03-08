FROM golang:1.15

ENV GO111MODULE=on

WORKDIR /app

COPY final/. .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build

EXPOSE 8080

ENTRYPOINT ["/app/main"]