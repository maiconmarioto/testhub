package main

import (
	"log"

	"testhub-api-go/internal/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
