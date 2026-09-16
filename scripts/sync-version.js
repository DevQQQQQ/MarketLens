/**
 * MarketLens Version Synchronization Tool
 * 自动从 package.json 读取当前 version，并无损同步至：
 * 1. README.md & README.en.md 顶部的 Release Badge
 * 2. RELEASE.md 打包指南与命令行示例
 */

const fs = require('node:fs');
const path = require('node:path');

function syncVersion(rootDir = path.resolve(__dirname, '..')) {
	const pkgPath = path.join(rootDir, 'package.json');
	if (!fs.existsSync(pkgPath)) {
		throw new Error(`package.json not found at ${pkgPath}`);
	}

	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	const version = pkg.version;
	if (!version) {
		throw new Error('version field missing in package.json');
	}

	const modifiedFiles = [];

	// 1. 同步 README.md & README.en.md 的 Release Badge
	const badgePattern = /https:\/\/img\.shields\.io\/badge\/Release-v[0-9A-Za-z_.-]+-blue\.svg/g;
	const targetBadgeUrl = `https://img.shields.io/badge/Release-v${version}-blue.svg`;

	const readmes = ['README.md', 'README.en.md'];
	for (const filename of readmes) {
		const filePath = path.join(rootDir, filename);
		if (fs.existsSync(filePath)) {
			const original = fs.readFileSync(filePath, 'utf8');
			const updated = original.replace(badgePattern, targetBadgeUrl);
			if (updated !== original) {
				fs.writeFileSync(filePath, updated, 'utf8');
				modifiedFiles.push(filename);
			}
		}
	}

	// 2. 同步 RELEASE.md 的 vsix 文件名与示例
	const releaseMdPath = path.join(rootDir, 'RELEASE.md');
	if (fs.existsSync(releaseMdPath)) {
		const original = fs.readFileSync(releaseMdPath, 'utf8');
		let updated = original.replace(/marketlens-[0-9.]+\.vsix/g, `marketlens-${version}.vsix`);
		updated = updated.replace(/git tag v[0-9.]+ && git push origin v[0-9.]+/g, `git tag v${version} && git push origin v${version}`);
		if (updated !== original) {
			fs.writeFileSync(releaseMdPath, updated, 'utf8');
			modifiedFiles.push('RELEASE.md');
		}
	}

	// 3. 自动扫描并清理旧版本的 .vsix 安装包
	const deletedVsix = cleanOldVsix(rootDir, version);

	return {
		version,
		modifiedFiles,
		deletedVsix
	};
}

/**
 * 扫描并自动删除旧版本的 marketlens-*.vsix
 */
function cleanOldVsix(rootDir = path.resolve(__dirname, '..'), currentVersion) {
	if (!currentVersion) {
		const pkgPath = path.join(rootDir, 'package.json');
		if (fs.existsSync(pkgPath)) {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
			currentVersion = pkg.version;
		}
	}
	if (!currentVersion) return [];

	const deletedFiles = [];
	const files = fs.readdirSync(rootDir);
	const vsixRegex = /^marketlens-([0-9A-Za-z_.-]+)\.vsix$/i;

	for (const file of files) {
		const match = file.match(vsixRegex);
		if (match) {
			const fileVer = match[1];
			if (fileVer !== currentVersion) {
				const fullPath = path.join(rootDir, file);
				try {
					fs.unlinkSync(fullPath);
					deletedFiles.push(file);
				} catch (err) {
					console.warn(`[MarketLens] ⚠️ Could not remove ${file}:`, err);
				}
			}
		}
	}
	return deletedFiles;
}

if (require.main === module) {
	try {
		const result = syncVersion();
		if (result.modifiedFiles.length > 0) {
			console.log(`[MarketLens] 🔄 Version synchronized to v${result.version} in: ${result.modifiedFiles.join(', ')}`);
		} else {
			console.log(`[MarketLens] ✅ All documentation and assets already in sync with v${result.version}`);
		}
		if (result.deletedVsix && result.deletedVsix.length > 0) {
			console.log(`[MarketLens] 🗑️ Cleaned up outdated VSIX package(s): ${result.deletedVsix.join(', ')}`);
		}
	} catch (err) {
		console.error('[MarketLens] ❌ Failed to sync version:', err);
		process.exit(1);
	}
}

module.exports = { syncVersion, cleanOldVsix };

