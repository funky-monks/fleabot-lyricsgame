import express from "express";
import { Endpoints } from "./Endpoints";
import * as http from "http";

export class Application {
  private server?: http.Server;
  public run(port = 8080): void {
    const app = express();
    const endpoints = new Endpoints({ message: "Hello world!" });
    app.get("/", endpoints.root.bind(endpoints));
    console.log(`Listening on port ${port}`);
    this.server = app.listen(port);
  }
}
