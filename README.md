# browser-macro

Chrome拡張機能（Manifest V3）を使用したブラウザマクロの記録・実行ツールです。

## 機能

- ブラウザ操作の記録
- 記録したマクロの実行
- マクロの管理

## セットアップ

### 前提条件

- Docker と Docker Compose がインストールされていること

### インストール

```bash
# 依存関係のインストール
docker-compose run --rm dev npm install
```

## 開発

### ビルド

```bash
# ビルド
docker-compose run --rm dev npm run build

# ビルド監視（ファイル変更時に自動ビルド）
docker-compose run --rm dev npm run build:watch
```

### テスト

```bash
# テスト実行
docker-compose run --rm dev npm test

# テスト監視
docker-compose run --rm dev npm run test:watch

# E2Eテスト
docker-compose run --rm dev npm run test:e2e
```

### 開発シェル

```bash
docker-compose run --rm dev bash
```

## Chrome拡張機能のインストール

1. プロジェクトをビルド（`npm run build`）
2. Chromeで `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `dist` ディレクトリを選択

## 使い方

1. 拡張機能のアイコンをクリックしてポップアップを開く
2. マクロの記録を開始
3. ブラウザ操作を実行
4. 記録を停止
5. 保存したマクロを実行

## プロジェクト構成

```
src/
  background/  # バックグラウンドスクリプト
  content/     # コンテンツスクリプト
  popup/       # ポップアップUI
  options/     # オプションページUI
  shared/      # 共有型定義・ユーティリティ
```

## ビルド成果物

ビルド後のファイルは `dist/` ディレクトリに出力されます。

