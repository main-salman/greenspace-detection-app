# Installer Testing Matrix

## Testing Strategy for Different Mac Configurations

### Pre-Testing Validation
**Before testing on any Mac, run the validation script:**
```bash
./installer-validation-test.sh
```

### Test Matrix

| Configuration | Priority | Test Requirements |
|---------------|----------|------------------|
| **Intel Mac + macOS 13+** | HIGH | - Clean system test<br>- Development environment test |
| **Apple Silicon + macOS 13+** | HIGH | - Native ARM64 test<br>- Rosetta compatibility test |
| **Corporate/Managed Mac** | MEDIUM | - Firewall/proxy test<br>- Admin privileges test |
| **Older macOS (11-12)** | MEDIUM | - Legacy compatibility test |
| **Developer Machine** | LOW | - Existing Node/Python conflicts |

### Critical Test Scenarios

#### 1. Clean System Test (Most Important)
- **Target**: Fresh Mac with minimal software
- **Steps**:
  1. Install only Node.js and Python from official sites
  2. Run validation script
  3. Test installer
  4. Verify app launches and processes satellite data

#### 2. Path Detection Test
- **Target**: Different Node.js installation methods
- **Variations**:
  - Homebrew installation (`/opt/homebrew/bin/`)
  - Official installer (`/usr/local/bin/`)
  - NVM installation (`~/.nvm/versions/node/`)
- **Validation**: Installer detects and uses correct paths

#### 3. Network Isolation Test
- **Target**: Corporate/restricted networks
- **Checks**:
  - npm registry access
  - PyPI access
  - Satellite data downloads
  - Proxy handling

#### 4. Timeout Handling Test
- **Target**: Slow network conditions
- **Validation**: 3% hanging issue is resolved

### Automated Testing Approach

#### Phase 1: Pre-Installation Validation
```bash
# Run on each test machine
./installer-validation-test.sh > validation-report-$(hostname).txt
```

#### Phase 2: Installation Testing
```bash
# Extract installer
unzip greenspace-detection-web-installer.zip
cd greenspace-detection-*

# Run installer with logging
./install.command 2>&1 | tee install-log-$(hostname).txt
```

#### Phase 3: Runtime Testing
```bash
# Test app functionality
cd "$HOME/Applications/Greenspace Detection"
./launch.sh 2>&1 | tee runtime-log-$(hostname).txt

# Wait for startup, then test satellite processing
# (Manual verification of web interface)
```

### Success Criteria

✅ **Installation Success**:
- [ ] All dependencies install without errors
- [ ] Desktop shortcut created and functional
- [ ] App launches and reaches localhost:3000

✅ **Runtime Success**:
- [ ] Can select a city and date range
- [ ] Satellite processing completes without hanging
- [ ] NDVI analysis generates successfully
- [ ] Results display properly

### Failure Response Plan

If testing reveals failures:

1. **Document the failure**:
   ```bash
   # Collect system info
   sw_vers > failure-report-$(hostname).txt
   uname -a >> failure-report-$(hostname).txt
   which node npm python3 >> failure-report-$(hostname).txt
   
   # Attach logs
   cat install-log-$(hostname).txt >> failure-report-$(hostname).txt
   cat runtime-log-$(hostname).txt >> failure-report-$(hostname).txt
   ```

2. **Categorize the issue**:
   - Environment/Prerequisites
   - Network/Connectivity  
   - Path Detection
   - Dependency Installation
   - Runtime/Processing

3. **Fix and re-test**

### Remote Testing Options

For testing on machines you don't have direct access to:

#### Option 1: Virtual Machine Testing
- Create VMs with different macOS versions
- Test clean installations

#### Option 2: Collaborator Testing
- Send validation script + installer to trusted users
- Request structured feedback using provided templates

#### Option 3: CI/CD Testing (Advanced)
- GitHub Actions with macOS runners
- Automated testing matrix

### Test Templates

#### For Collaborators
```
GREENSPACE DETECTION APP - INSTALLER TEST

System: [Mac model, macOS version]
Date: [Test date]

Pre-Installation:
□ Ran validation script: ./installer-validation-test.sh
□ Result: PASS/FAIL/WARNINGS
□ Attached validation report: validation-report.txt

Installation:
□ Downloaded and extracted installer
□ Ran install.command
□ Result: SUCCESS/FAILED
□ Desktop shortcut created: YES/NO
□ Attached installation log: install-log.txt

Runtime:
□ App launched successfully: YES/NO
□ Could access localhost:3000: YES/NO
□ Selected test city: [city name]
□ Processing completed: YES/NO/HUNG
□ Time to complete: [X minutes]
□ Generated NDVI results: YES/NO
□ Attached runtime log: runtime-log.txt

Issues Encountered:
[Description of any problems]

Overall Rating: WORKS PERFECTLY/WORKS WITH ISSUES/COMPLETELY BROKEN
```

This comprehensive testing approach will help ensure your installer works reliably across different Mac configurations before broader distribution.