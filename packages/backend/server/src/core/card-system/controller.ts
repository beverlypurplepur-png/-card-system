import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { CurrentUser, type CurrentUser as User } from "../auth";
import { PermissionAccess } from "../permission";
import { CardSystemRepository } from "./repository";
import type { LegacyImport } from "./types";

const object = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Expected an object");
  }
  return value as Record<string, unknown>;
};

@Controller("/api/card-system/workspaces/:workspaceId")
export class CardSystemController {
  constructor(
    private readonly cards: CardSystemRepository,
    private readonly permissions: PermissionAccess,
  ) {}

  private async read(user: User, workspaceId: string) {
    await this.permissions
      .user(user.id)
      .workspace(workspaceId)
      .assert("Workspace.Read");
  }

  private async write(user: User, workspaceId: string) {
    await this.permissions
      .user(user.id)
      .workspace(workspaceId)
      .assert("Workspace.CreateDoc");
  }

  @Get("/decks")
  async listDecks(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Query("includeDeleted") includeDeleted?: string,
  ) {
    await this.read(user, workspaceId);
    return this.cards.listDecks(workspaceId, includeDeleted === "true");
  }

  @Post("/decks")
  async createDeck(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    await this.write(user, workspaceId);
    const input = object(body);
    return this.cards.createDeck(workspaceId, {
      id: typeof input.id === "string" ? input.id : undefined,
      name: input.name,
    });
  }

  @Patch("/decks/:deckId")
  async updateDeck(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("deckId") deckId: string,
    @Body() body: unknown,
  ) {
    await this.write(user, workspaceId);
    return this.cards.updateDeck(workspaceId, deckId, object(body).name);
  }

  @Delete("/decks/:deckId")
  async deleteDeck(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("deckId") deckId: string,
  ) {
    await this.write(user, workspaceId);
    return this.cards.deleteDeck(workspaceId, deckId);
  }

  @Post("/decks/:deckId/restore")
  async restoreDeck(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("deckId") deckId: string,
  ) {
    await this.write(user, workspaceId);
    return this.cards.restoreDeck(workspaceId, deckId);
  }

  @Get("/cards")
  async listCards(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Query("deckId") deckId?: string,
    @Query("includeDeleted") includeDeleted?: string,
  ) {
    await this.read(user, workspaceId);
    return this.cards.listCards(workspaceId, deckId, includeDeleted === "true");
  }

  @Post("/cards")
  async createCard(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    await this.write(user, workspaceId);
    const input = object(body);
    return this.cards.createManualCard(workspaceId, {
      id: typeof input.id === "string" ? input.id : undefined,
      deckId: String(input.deckId ?? ""),
      front: input.front,
      back: input.back,
      streak: input.streak,
      intervalDays: input.intervalDays,
      nextReviewAt: input.nextReviewAt,
    });
  }

  @Patch("/cards/:cardId")
  async updateCard(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("cardId") cardId: string,
    @Body() body: unknown,
  ) {
    await this.write(user, workspaceId);
    const input = object(body);
    return this.cards.updateManualCard(workspaceId, cardId, {
      deckId: String(input.deckId ?? ""),
      front: input.front,
      back: input.back,
      streak: input.streak,
      intervalDays: input.intervalDays,
      nextReviewAt: input.nextReviewAt,
    });
  }

  @Delete("/cards/:cardId")
  async deleteCard(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("cardId") cardId: string,
  ) {
    await this.write(user, workspaceId);
    return this.cards.setCardDeleted(workspaceId, cardId, true);
  }

  @Post("/cards/:cardId/restore")
  async restoreCard(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("cardId") cardId: string,
  ) {
    await this.write(user, workspaceId);
    return this.cards.setCardDeleted(workspaceId, cardId, false);
  }

  @Put("/cards/:cardId/review")
  async reviewCard(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Param("cardId") cardId: string,
    @Body() body: unknown,
  ) {
    await this.write(user, workspaceId);
    const input = object(body);
    return this.cards.updateReview(workspaceId, cardId, {
      streak: input.streak,
      intervalDays: input.intervalDays,
      nextReviewAt: input.nextReviewAt,
    });
  }

  @Post("/import/local-storage")
  async importLocalStorage(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    await this.write(user, workspaceId);
    return this.cards.importLegacy(workspaceId, object(body) as LegacyImport);
  }
}
