const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function testVersion() {
  const zipPath = path.join(__dirname, 'notebooklm_ext_v1.8.4.zip');
  
  // 1. 验证 zip 文件是否存在
  if (!fs.existsSync(zipPath)) {
    console.error('❌ 测试失败: notebooklm_ext_v1.8.4.zip 不存在');
    process.exit(1);
  }
  console.log('✅ 验证成功: notebooklm_ext_v1.8.4.zip 存在');

  try {
    // 2. 从 zip 中提取 manifest.json 内容
    const manifestContent = execSync(`unzip -p "${zipPath}" extension/manifest.json`, { encoding: 'utf8' });
    const manifest = JSON.parse(manifestContent);
    
    if (manifest.version === '1.8.4') {
      console.log('✅ 验证成功: zip 内 manifest.json 的版本号为 1.8.4');
    } else {
      console.error(`❌ 测试失败: zip 内 manifest.json 的版本号为 ${manifest.version}，预期为 1.8.4`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 测试失败: 无法读取 zip 内的 manifest.json', error);
    process.exit(1);
  }

  console.log('🎉 所有测试通过！');
}

testVersion();
