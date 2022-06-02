import { Request, Response } from "express";
import { Message } from "./Message";

export class Endpoints {
  constructor(public defaultMessage: Message) {}
  public async root(req: Request, res: Response) {
    return res.status(200).json(this.defaultMessage);
  }
}
