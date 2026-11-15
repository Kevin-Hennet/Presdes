import type { Page } from '@playwright/test';

export const fictionalPhoto = 'public/fictional-label.png';

export class ScanPage {
  constructor(readonly page: Page) {}

  async open() {
    await this.page.goto('/');
  }

  async choosePhoto(file = fictionalPhoto) {
    await this.page.getByLabel('Photo file', { exact: true }).setInputFiles(file);
  }

  async reviewPhoto(number: number) {
    await this.page.getByRole('button', { name: 'Review photo ' + number, exact: true }).click();
  }

  async analyze() {
    await this.page.getByRole('button', { name: 'Analyze label' }).click();
  }
}
