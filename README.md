# ATM10 Update Viewer

All the Mods 10の公式Changelogをもとに、アップデート内容やModの変更を日本語で確認できる非公式サイトです。

**https://keisuke111.github.io/atm10-update-viewer/**

## Features

- ATM10のバージョン間を比較
- Modの追加・更新・削除を確認
- Mod名で検索
- アップデート内容を日本語で確認
- 根拠となる公式Changelogを確認

## Development

Node.js 22以上。

```sh
npm test
npm run build
npm start
```

Changelogを更新する場合：

```sh
npm run fetch:all
npm run fill:ja
npm test
npm run build
```

## Data source

データは[All the Mods 10公式リポジトリ](https://github.com/AllTheMods/ATM-10)のChangelogをもとにしています。

本プロジェクトは非公式であり、All The Modsチーム、Mojang、Microsoftとは関係ありません。

## License

このリポジトリのソースコードは[MIT License](./LICENSE)のもとで公開しています。

第三者のコンテンツ、商標、Changelogの抜粋、およびAll the Mods 10に由来するデータはMIT Licenseの対象外です。

詳しくは[NOTICE.md](./NOTICE.md)を参照してください。
