# Practical OpenTelemetry

[![CC BY 4.0][cc-by-shield]][cc-by]

👋 Howdy! This repository is intended to be an interactive example of how you'd integrate OpenTelemetry Tracing 1.0 into a client/server application.

## Table of Contents
* [Go](./go/README.md)
* [C#](./csharp/README.md)
* [Java](./java/README.md)
* [JavaScript (Node.JS)](./js/README.md)
* [JavaScript (React/Web)](./web/README.md)

## Prerequisites

* Docker
* Git

I presume that you have some familiarity with common shell operations such as executing programs, file and directory manipulation, and so forth. For reference, I'm using [Visual Studio Code](https://code.visualstudio.com/) as an IDE and a Debian-based Linux distribution.

## Design and Objectives

These examples are intended to demonstrate several important concepts in OpenTelemetry - most notably, context propagation over RPCs, managing in-process span context, and configuring the export of telemetry data from an OpenTelemetry Collector.

## Using This Repository

Each tutorial is written with a 'base' and 'final' version, and the tutorial itself starts from the 'base' version and demonstrates how to get to the 'final' version. You can either follow along by running the base version and modifying it, step-by-step, or simply jump to the final version of each tutorial by running the `docker-compose.yaml` file associated with each language's tutorial.

## About OpenTelemetry

OpenTelemetry is an _observability framework_ -- it's a set of interfaces, libraries, and tools that are designed to help you create and manage _telemetry data_ like metrics, traces, and logs. "What's observability, then?" There's been much and more written about this topic, but to summarize, observability is a set of principles and practices that help you communicate, manage, and understand the performance of distributed systems or other forms of 'cloud-native' applications. Observability, as a practice, is all about helping you ask and answer arbitrary questions about your system as a part of monitoring system health and performance. It requires high-quality telemetry data, and that's where OpenTelemetry comes in.

For a more thorough introduction to OpenTelemetry as a concept and as a project, please see the [OpenTelemetry Documentation](https://opentelemetry.io/docs/).

## Addendum

This work is licensed under a
[Creative Commons Attribution 4.0 International License][cc-by].

[![CC BY 4.0][cc-by-image]][cc-by]

[cc-by]: http://creativecommons.org/licenses/by/4.0/
[cc-by-image]: https://i.creativecommons.org/l/by/4.0/88x31.png
[cc-by-shield]: https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg

Please note that the work covered by this license is strictly limited to the example code and documentation in this repository, dependencies and other linked software may be covered by other licenses which are superseded by CC-BY-4.0.