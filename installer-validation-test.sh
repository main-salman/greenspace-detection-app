#!/bin/bash

# Comprehensive Installer Validation Test
# Tests the installer on different Mac configurations without actually installing

set -e

echo "🧪 Greenspace Detection App - Installer Validation Test"
echo "======================================================="

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[TEST]${NC} $1"; }
print_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[FAIL]${NC} $1"; }

ERRORS=0
WARNINGS=0

check_requirement() {
    local name=$1
    local cmd=$2
    local expected_pattern=$3
    local install_url=$4
    
    print_status "Checking $name..."
    
    if command -v "$cmd" &> /dev/null; then
        version=$($cmd --version 2>&1 | head -1)
        if [[ -n "$expected_pattern" ]] && [[ $version =~ $expected_pattern ]]; then
            print_success "$name found: $version"
        else
            print_warning "$name found but version might be incompatible: $version"
            ((WARNINGS++))
        fi
    else
        print_error "$name not found. Install from: $install_url"
        ((ERRORS++))
    fi
}

test_node_paths() {
    print_status "Testing Node.js path detection (matches installer logic)..."
    
    NODE_PATHS=(
        "/usr/local/bin/node"
        "/opt/homebrew/bin/node"
        "$HOME/.nvm/versions/node/*/bin/node"
        "$(which node 2>/dev/null)"
    )
    
    NPM_PATHS=(
        "/usr/local/bin/npm"
        "/opt/homebrew/bin/npm"
        "$HOME/.nvm/versions/node/*/bin/npm"
        "$(which npm 2>/dev/null)"
    )
    
    NODE_FOUND=false
    NPM_FOUND=false
    
    for node_path in "${NODE_PATHS[@]}"; do
        if [[ -n "$node_path" ]] && [[ -x "$node_path" ]]; then
            print_success "Node.js detected at: $node_path"
            NODE_FOUND=true
            break
        fi
    done
    
    for npm_path in "${NPM_PATHS[@]}"; do
        if [[ -n "$npm_path" ]] && [[ -x "$npm_path" ]]; then
            print_success "npm detected at: $npm_path"
            NPM_FOUND=true
            break
        fi
    done
    
    if ! $NODE_FOUND; then
        print_error "Node.js path detection failed - installer will fail"
        ((ERRORS++))
    fi
    
    if ! $NPM_FOUND; then
        print_error "npm path detection failed - installer will fail"
        ((ERRORS++))
    fi
}

test_python_capabilities() {
    print_status "Testing Python environment capabilities..."
    
    # Test virtual environment creation
    TEMP_VENV=$(mktemp -d)/test_venv
    if python3 -m venv "$TEMP_VENV" 2>/dev/null; then
        print_success "Python virtual environment creation works"
        rm -rf "$TEMP_VENV"
    else
        print_error "Python virtual environment creation failed"
        ((ERRORS++))
    fi
    
    # Test key dependencies availability
    print_status "Testing critical Python dependencies..."
    
    TEMP_VENV=$(mktemp -d)/test_deps
    python3 -m venv "$TEMP_VENV"
    source "$TEMP_VENV/bin/activate"
    
    # Test if pip can install key dependencies
    critical_deps=("numpy" "requests" "pillow")
    for dep in "${critical_deps[@]}"; do
        if pip install "$dep" >/dev/null 2>&1; then
            print_success "Can install $dep"
        else
            print_error "Cannot install $dep - network or compatibility issue"
            ((ERRORS++))
        fi
    done
    
    deactivate
    rm -rf "$TEMP_VENV"
}

test_port_availability() {
    print_status "Testing port 3000 availability..."
    
    if lsof -i :3000 >/dev/null 2>&1; then
        print_warning "Port 3000 is currently in use - installer will handle this"
        ((WARNINGS++))
    else
        print_success "Port 3000 is available"
    fi
}

test_xcode_tools() {
    print_status "Testing Xcode Command Line Tools..."
    
    if xcode-select -p &> /dev/null; then
        xcode_path=$(xcode-select -p)
        print_success "Xcode Command Line Tools found at: $xcode_path"
    else
        print_warning "Xcode Command Line Tools not found - some npm packages may fail to compile"
        echo "           Install with: xcode-select --install"
        ((WARNINGS++))
    fi
}

test_disk_space() {
    print_status "Testing available disk space..."
    
    HOME_SPACE=$(df -h "$HOME" | tail -1 | awk '{print $4}' | sed 's/[^0-9.]//g')
    if (( $(echo "$HOME_SPACE > 1" | bc -l) )); then
        print_success "Sufficient disk space available: ${HOME_SPACE}GB+"
    else
        print_warning "Low disk space: ${HOME_SPACE}GB - installation may fail"
        ((WARNINGS++))
    fi
}

test_network_connectivity() {
    print_status "Testing network connectivity for npm and pip..."
    
    # Test npm registry
    if curl -s --max-time 10 https://registry.npmjs.org/ >/dev/null; then
        print_success "npm registry accessible"
    else
        print_error "Cannot reach npm registry - installation will fail"
        ((ERRORS++))
    fi
    
    # Test PyPI
    if curl -s --max-time 10 https://pypi.org/ >/dev/null; then
        print_success "PyPI accessible"
    else
        print_error "Cannot reach PyPI - Python package installation will fail"
        ((ERRORS++))
    fi
}

simulate_installer_steps() {
    print_status "Simulating installer steps..."
    
    # Test directory creation
    TEST_INSTALL_DIR="/tmp/greenspace-test-$$"
    if mkdir -p "$TEST_INSTALL_DIR" 2>/dev/null; then
        print_success "Can create installation directory"
        rm -rf "$TEST_INSTALL_DIR"
    else
        print_error "Cannot create installation directory"
        ((ERRORS++))
    fi
    
    # Test desktop shortcut creation
    DESKTOP_TEST="$HOME/Desktop/test-shortcut-$$"
    if touch "$DESKTOP_TEST" 2>/dev/null; then
        print_success "Can create desktop shortcuts"
        rm -f "$DESKTOP_TEST"
    else
        print_warning "Cannot create desktop shortcuts"
        ((WARNINGS++))
    fi
}

generate_pre_install_report() {
    print_status "Generating pre-installation system report..."
    
    echo ""
    echo "=== SYSTEM ENVIRONMENT REPORT ==="
    echo "macOS Version: $(sw_vers -productVersion)"
    echo "Architecture: $(uname -m)"
    echo "Shell: $SHELL"
    echo "Node.js: $(node --version 2>/dev/null || echo 'Not installed')"
    echo "npm: $(npm --version 2>/dev/null || echo 'Not installed')"
    echo "Python3: $(python3 --version 2>/dev/null || echo 'Not installed')"
    echo "pip3: $(pip3 --version 2>/dev/null || echo 'Not installed')"
    echo "Xcode Tools: $(xcode-select -p 2>/dev/null || echo 'Not installed')"
    echo "Available Space: $(df -h "$HOME" | tail -1 | awk '{print $4}')"
    echo "=================================="
    echo ""
}

# Main test execution
print_status "Starting comprehensive installer validation..."
echo ""

generate_pre_install_report

check_requirement "Node.js" "node" "v1[8-9]\.|v[2-9][0-9]\." "https://nodejs.org/"
check_requirement "npm" "npm" "[6-9]\.|[1-9][0-9]\." "https://nodejs.org/"
check_requirement "Python 3" "python3" "Python 3\.[8-9]\.|Python 3\.[1-9][0-9]\." "https://python.org/"

test_node_paths
test_python_capabilities
test_port_availability
test_xcode_tools
test_disk_space
test_network_connectivity
simulate_installer_steps

echo ""
echo "=== VALIDATION SUMMARY ==="
if [[ $ERRORS -eq 0 ]]; then
    print_success "✅ ALL TESTS PASSED - Installer should work!"
    echo "   The installer is likely to succeed on this system."
else
    print_error "❌ ${ERRORS} CRITICAL ISSUES FOUND"
    echo "   The installer will likely fail. Fix these issues first:"
    echo "   - Install missing requirements"
    echo "   - Fix network connectivity"
    echo "   - Ensure sufficient disk space"
fi

if [[ $WARNINGS -gt 0 ]]; then
    print_warning "⚠️  ${WARNINGS} WARNINGS - Installer might work but could have issues"
fi

echo ""
echo "=== RECOMMENDATIONS ==="
if [[ $ERRORS -eq 0 ]]; then
    echo "✅ Ready to test installer on this system"
    echo "✅ Consider testing on other Mac configurations:"
    echo "   - Intel vs Apple Silicon Macs"
    echo "   - Different macOS versions"
    echo "   - Clean systems without development tools"
    echo "   - Systems with corporate firewalls/proxies"
else
    echo "❌ Fix critical issues before testing installer"
fi

echo ""
echo "Run this script on target test machines before attempting installation."

exit $ERRORS