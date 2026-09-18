import { isFrameReference } from '@affine/card-system';
import { CardRegistry } from '@affine/card-system/registry';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { CurrentUser, type CurrentUser as User } from '../auth';
import { PermissionAccess, PermissionModule } from '../permission';

@Controller('/api/card-system')
export class CardSystemController {
  constructor(
    private readonly registry: CardRegistry,
    private readonly permissions: PermissionAccess
  ) {}

  @Get('/status')
  status() {
    // Explicitly opt in only after the separate migration has been approved/applied.
    return { enabled: process.env.CARD_SYSTEM_ENABLED === 'true' };
  }

  private async authorize(user: User, body: unknown) {
    if (!this.status().enabled)
      throw new ServiceUnavailableException('Card System is disabled');
    if (!isFrameReference(body))
      throw new BadRequestException(
        'Expected only workspace_id, document_id and frame_id'
      );
    await this.permissions
      .user(user.id)
      .doc(body.workspace_id, body.document_id)
      .assert('Doc.Update');
    return body;
  }

  @Post('/cards/register')
  async register(@CurrentUser() user: User, @Body() body: unknown) {
    return this.registry.registerFrame(await this.authorize(user, body));
  }

  @Post('/cards/delete')
  async delete(@CurrentUser() user: User, @Body() body: unknown) {
    return this.registry.deleteFrame(await this.authorize(user, body));
  }
}

@Module({
  imports: [PermissionModule],
  controllers: [CardSystemController],
  providers: [
    {
      provide: CardRegistry,
      inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) =>
        new CardRegistry({
          // SQL is fixed in CardRegistry; reference values are bound parameters.
          query: <T>(sql: string, parameters: unknown[]) =>
            prisma.$queryRawUnsafe<T[]>(sql, ...parameters),
        }),
    },
  ],
})
export class CardSystemModule {}
