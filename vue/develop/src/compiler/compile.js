var _ = require('../util')
var compileProps = require('./compile-props')
var config = require('../config')
var textParser = require('../parsers/text')
var dirParser = require('../parsers/directive')
var templateParser = require('../parsers/template')
var resolveAsset = _.resolveAsset
var componentDef = require('../directives/component')

// terminal directives
var terminalDirectives = [
    'repeat',
    'if'
]

/**
 * Compile a template and return a reusable composite link
 * function, which recursively contains more link functions
 * inside. This top level compile function would normally
 * be called on instance root nodes, but can also be used
 * for partial compilation if the partial argument is true.
 *
 * 编译一个模版，返回一个可复用的合成链接函数
 * 内部包含了更多的递归连接函数
 * 这个顶级编译函数通常会被称为根节点实例
 * 但是只要参数正确也能够被局部使用
 *
 * 
 * The returned composite link function, when called, will
 * return an unlink function that tearsdown all directives
 * created during the linking phase.
 *
 * @param {Element|DocumentFragment} el
 * @param {Object} options
 * @param {Boolean} partial
 * @return {Function}
 */

exports.compile = function(el, options, partial) {

    // link function for the node itself.
    // 节点本身
    var nodeLinkFn = partial || !options._asComponent ? compileNode(el, options) : null
    
    // link function for the childNodes
    // 子节点
    var childLinkFn = !(nodeLinkFn && nodeLinkFn.terminal) &&
        el.tagName !== 'SCRIPT' &&
        el.hasChildNodes() ? compileNodeList(el.childNodes, options) : null

    /**
     * A composite linker function to be called on a already
     * compiled piece of DOM, which instantiates all directive
     * instances.
     *
     * @param {Vue} vm
     * @param {Element|DocumentFragment} el
     * @param {Vue} [host] - host vm of transcluded content
     * @return {Function|undefined}
     */

    return function compositeLinkFn(vm, el, host) {
        // cache childNodes before linking parent, fix #657
        var childNodes = _.toArray(el.childNodes)
            // link
        var dirs = linkAndCapture(function() {
            if (nodeLinkFn) nodeLinkFn(vm, el, host)
            if (childLinkFn) childLinkFn(vm, childNodes, host)
        }, vm)
        return makeUnlinkFn(vm, dirs)
    }
}

/**
 * Apply a linker to a vm/element pair and capture the
 * 应用一个链接到一个vm /元素对和捕获
 * directives created during the process.
 *
 * @param {Function} linker
 * @param {Vue} vm
 */

function linkAndCapture(linker, vm) {
    var originalDirCount = vm._directives.length
    linker()
    return vm._directives.slice(originalDirCount)
}

/**
 * Linker functions return an unlink function that
 * tearsdown all directives instances generated during
 * the process.
 *
 * We create unlink functions with only the necessary
 * information to avoid retaining additional closures.
 *
 * @param {Vue} vm
 * @param {Array} dirs
 * @param {Vue} [context]
 * @param {Array} [contextDirs]
 * @return {Function}
 */

function makeUnlinkFn(vm, dirs, context, contextDirs) {
    return function unlink(destroying) {
        teardownDirs(vm, dirs, destroying)
        if (context && contextDirs) {
            teardownDirs(context, contextDirs)
        }
    }
}

/**
 * Teardown partial linked directives.
 *
 * @param {Vue} vm
 * @param {Array} dirs
 * @param {Boolean} destroying
 */

function teardownDirs(vm, dirs, destroying) {
    var i = dirs.length
    while (i--) {
        dirs[i]._teardown()
        if (!destroying) {
            vm._directives.$remove(dirs[i])
        }
    }
}

/**
 * Compile link props on an instance.
 *
 * @param {Vue} vm
 * @param {Element} el
 * @param {Object} options
 * @return {Function}
 */

exports.compileAndLinkProps = function(vm, el, props) {
    var propsLinkFn = compileProps(el, props)
    var propDirs = linkAndCapture(function() {
        propsLinkFn(vm, null)
    }, vm)
    return makeUnlinkFn(vm, propDirs)
}

/**
 * Compile the root element of an instance.
 *
 * 1. attrs on context container (context scope)
 * 2. attrs on the component template root node, if
 *    replace:true (child scope)
 *
 * If this is a fragment instance, we only need to compile 1.
 *
 * @param {Vue} vm
 * @param {Element} el
 * @param {Object} options
 * @return {Function}
 */

exports.compileRoot = function(el, options) {
    var containerAttrs = options._containerAttrs
    var replacerAttrs = options._replacerAttrs
    var contextLinkFn, replacerLinkFn

    // only need to compile other attributes for
    // non-fragment instances
    if (el.nodeType !== 11) {
        // for components, container and replacer need to be
        // compiled separately and linked in different scopes.
        if (options._asComponent) {
            // 2. container attributes
            if (containerAttrs) {
                contextLinkFn = compileDirectives(containerAttrs, options)
            }
            if (replacerAttrs) {
                // 3. replacer attributes
                replacerLinkFn = compileDirectives(replacerAttrs, options)
            }
        } else {
            // non-component, just compile as a normal element.
            // 没组件，只是正常编译一个普通元素
            // 
            // replacerLinkFn 
            //      解析dirs指令合集
            // 
            replacerLinkFn = compileDirectives(el.attributes, options)
        }
    }

    return function rootLinkFn(vm, el) {
        // link context scope dirs
        var context = vm._context
        var contextDirs
        if (context && contextLinkFn) {
            contextDirs = linkAndCapture(function() {
                contextLinkFn(context, el)
            }, context)
        }

        // link self
        // 编译出节点的指令
        // 生成指令数组directives
        var selfDirs = linkAndCapture(function() {
            if (replacerLinkFn) replacerLinkFn(vm, el)
        }, vm)

        // return the unlink function that tearsdown context
        // container directives.
        return makeUnlinkFn(vm, selfDirs, context, contextDirs)
    }
}

/**
 * Compile a node and return a nodeLinkFn based on the
 * node type.
 *
 * @param {Node} node
 * @param {Object} options
 * @return {Function|null}
 */

function compileNode(node, options) {
    var type = node.nodeType
    if (type === 1 && node.tagName !== 'SCRIPT') {
        return compileElement(node, options)
    } else if (type === 3 && config.interpolate && node.data.trim()) {
        return compileTextNode(node, options)
    } else {
        return null
    }
}

/**
 * Compile an element and return a nodeLinkFn.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Function|null}
 */

function compileElement(el, options) {
    // preprocess textareas.
    // textarea treats its text content as the initial value.
    // just bind it as a v-attr directive for value.
    if (el.tagName === 'TEXTAREA') {
        if (textParser.parse(el.value)) {
            el.setAttribute('value', el.value)
        }
    }
    var linkFn
    var hasAttrs = el.hasAttributes()
    // check terminal directives (repeat & if)
    // 检查是不是repeat或者if指令
    if (hasAttrs) {
        linkFn = checkTerminalDirectives(el, options)
    }
    // check element directives
    // 检测元素自定义属性
    if (!linkFn) {
        linkFn = checkElementDirectives(el, options)
    }
    // check component
    // 检查组件
    if (!linkFn) {
        linkFn = checkComponent(el, options)
    }
    // normal directives
    // 正常指令
    if (!linkFn && hasAttrs) {
        linkFn = compileDirectives(el.attributes, options)
    }
    return linkFn
}

/**
 * Compile a textNode and return a nodeLinkFn.
 *
 * @param {TextNode} node
 * @param {Object} options
 * @return {Function|null} textNodeLinkFn
 */

function compileTextNode(node, options) {
    var tokens = textParser.parse(node.data)
    if (!tokens) {
        return null
    }
    var frag = document.createDocumentFragment()

    var el, token
    for (var i = 0, l = tokens.length; i < l; i++) {
        token = tokens[i]

        el = token.tag 
            ? processTextToken(token, options) 
            : document.createTextNode(token.value)
        
        frag.appendChild(el)
    }

    return makeTextNodeLinkFn(tokens, frag, options)
}

/**
 * Process a single text token.
 * 处理单个文本标记
 * @param {Object} token
 * @param {Object} options
 * @return {Node}
 */

function processTextToken(token, options) {
    var el
    if (token.oneTime) {
        el = document.createTextNode(token.value)
    } else {
        if (token.html) {
            el = document.createComment('v-html')
            setTokenType('html')
        } else {
            // IE will clean up empty textNodes during
            // frag.cloneNode(true), so we have to give it
            // something here...
            el = document.createTextNode(' ')
            setTokenType('text')
        }
    }

    function setTokenType(type) {
        token.type = type
        token.def = resolveAsset(options, 'directives', type)
        token.descriptor = dirParser.parse(token.value)[0]
    }
    return el
}

/**
 * Build a function that processes a textNode.
 *
 * @param {Array<Object>} tokens
 * @param {DocumentFragment} frag
 */

function makeTextNodeLinkFn(tokens, frag) {
    return function textNodeLinkFn(vm, el) {
        var fragClone = frag.cloneNode(true)
        var childNodes = _.toArray(fragClone.childNodes)
        var token, value, node
        for (var i = 0, l = tokens.length; i < l; i++) {
            token = tokens[i]
            value = token.value
            if (token.tag) {
                node = childNodes[i]
                if (token.oneTime) {
                    value = vm.$eval(value)
                    if (token.html) {
                        _.replace(node, templateParser.parse(value, true))
                    } else {
                        node.data = value
                    }
                } else {
                    vm._bindDir(token.type, node,
                        token.descriptor, token.def)
                }
            }
        }
        _.replace(el, fragClone)
    }
}

/**
 * Compile a node list and return a childLinkFn.
 *
 * @param {NodeList} nodeList
 * @param {Object} options
 * @return {Function|undefined}
 */

function compileNodeList(nodeList, options) {
    var linkFns = []
    var nodeLinkFn, childLinkFn, node
    for (var i = 0, l = nodeList.length; i < l; i++) {
        node = nodeList[i]

        //编译节点
        nodeLinkFn = compileNode(node, options)

        //编译子节点
        //递归compileNodeList子节点
        childLinkFn = !(nodeLinkFn && nodeLinkFn.terminal) 
            && node.tagName !== 'SCRIPT' 
            && node.hasChildNodes() ? compileNodeList(node.childNodes, options) : null

        //存入节点列表
        linkFns.push(nodeLinkFn, childLinkFn)
    }
    return linkFns.length ? makeChildLinkFn(linkFns) : null
}

/**
 * Make a child link function for a node's childNodes.
 *
 * @param {Array<Function>} linkFns
 * @return {Function} childLinkFn
 */

function makeChildLinkFn(linkFns) {
    return function childLinkFn(vm, nodes, host) {
        var node, nodeLinkFn, childrenLinkFn
        for (var i = 0, n = 0, l = linkFns.length; i < l; n++) {
            node = nodes[n]
            
            nodeLinkFn = linkFns[i++]
            childrenLinkFn = linkFns[i++]
            // cache childNodes before linking parent, fix #657
            var childNodes = _.toArray(node.childNodes)

            //执行代码编译
            if (nodeLinkFn) {
                nodeLinkFn(vm, node, host)
            }
            if (childrenLinkFn) {
                childrenLinkFn(vm, childNodes, host)
            }
        }
    }
}

/**
 * Check for element directives (custom elements that should
 * be resovled as terminal directives).
 *
 * @param {Element} el
 * @param {Object} options
 */

function checkElementDirectives(el, options) {
    var tag = el.tagName.toLowerCase()
    if (_.commonTagRE.test(tag)) return
    var def = resolveAsset(options, 'elementDirectives', tag)
    if (def) {
        return makeTerminalNodeLinkFn(el, tag, '', options, def)
    }
}

/**
 * Check if an element is a component. If yes, return
 * a component link function.
 *
 * @param {Element} el
 * @param {Object} options
 * @param {Boolean} hasAttrs
 * @return {Function|undefined}
 */

function checkComponent(el, options, hasAttrs) {
    var componentId = _.checkComponent(el, options, hasAttrs)
    if (componentId) {
        var componentLinkFn = function(vm, el, host) {
            vm._bindDir('component', el, {
                expression: componentId
            }, componentDef, host)
        }
        componentLinkFn.terminal = true
        return componentLinkFn
    }
}

/**
 * Check an element for terminal directives in fixed order.
 * If it finds one, return a terminal link function.
 *
 * 检查终端指令按固定顺序的元素
 * 如果找到if repeat 返回一个终端结合的函数
 * 
 * @param {Element} el
 * @param {Object} options
 * @return {Function} terminalLinkFn
 */

function checkTerminalDirectives(el, options) {
    // 跳过编译此元素和此元素所有的子元素
    // 。跳过大量没有指令的节点可以加快编译速度。
    if (_.attr(el, 'pre') !== null) {
        return skip
    }
    var value, dirName
    for (var i = 0, l = terminalDirectives.length; i < l; i++) {
        dirName = terminalDirectives[i]
        if ((value = _.attr(el, dirName)) !== null) {
            return makeTerminalNodeLinkFn(el, dirName, value, options)
        }
    }
}

function skip() {}
skip.terminal = true

/**
 * Build a node link function for a terminal directive.
 * A terminal link function terminates the current
 * compilation recursion and handles compilation of the
 * subtree in the directive.
 *
 * @param {Element} el
 * @param {String} dirName
 * @param {String} value
 * @param {Object} options
 * @param {Object} [def]
 * @return {Function} terminalLinkFn
 */

function makeTerminalNodeLinkFn(el, dirName, value, options, def) {
    var descriptor = dirParser.parse(value)[0]
        // no need to call resolveAsset since terminal directives
        // are always internal
    def = def || options.directives[dirName]
    var fn = function terminalNodeLinkFn(vm, el, host) {
        vm._bindDir(dirName, el, descriptor, def, host)
    }
    fn.terminal = true
    return fn
}

/**
 * Compile the directives on an element and return a linker.
 * 编译元素上的指令，返回一个链接器 
 * @param {Array|NamedNodeMap} attrs
 * @param {Object} options
 * @return {Function}
 */

function compileDirectives(attrs, options) {
    var i = attrs.length
    var dirs = []
    var attr, name, value, dir, dirName, dirDef
    while (i--) {
        attr = attrs[i] 
        name = attr.name //"v-on"
        value = attr.value //"click:onClick"
        if (name.indexOf(config.prefix) === 0) { //如果是v开头
            dirName = name.slice(config.prefix.length) //"on"
            //找到对应的指定解释器 
            dirDef = resolveAsset(options, 'directives', dirName)
            if (process.env.NODE_ENV !== 'production') {
                _.assertAsset(dirDef, 'directive', dirName)
            }
            if (dirDef) {
                //指令解释器合集
                dirs.push({
                    name        : dirName,
                    //解析指令表达式
                    descriptors : dirParser.parse(value),
                    def         : dirDef
                })
            }
        } else if (config.interpolate) { //是否在模版中解析mustache标记
            // mustache 风格的绑定
            dir = collectAttrDirective(name, value, options)
            if (dir) {
                dirs.push(dir)
            }
        }
    }
    // sort by priority, LOW to HIGH
    // 根据属性的权重大小进行排序
    // 指令优先级
    if (dirs.length) {
        dirs.sort(directiveComparator)
        return makeNodeLinkFn(dirs)
    }
}

/**
 * Build a link function for all directives on a single node.
 * 建立一个链接功能指令在单个节点上。
 * @param {Array} directives
 * @return {Function} directivesLinkFn
 */

function makeNodeLinkFn(directives) {
    return function nodeLinkFn(vm, el, host) {
        // reverse apply because it's sorted low to high
        var i = directives.length
        var dir, j, k
        while (i--) {
            dir = directives[i]
            if (dir._link) {
                // custom link fn
                dir._link(vm, el)
            } else {
                //多个指令
                //v-on=
                //"mousedown:onDown,
                // mouseup:onUp"
                k = dir.descriptors.length
                for (j = 0; j < k; j++) {
                    vm._bindDir(dir.name, el,
                        dir.descriptors[j], dir.def, host)
                }
            }
        }
    }
}

/**
 * Check an attribute for potential dynamic bindings,
 * and return a directive object.
 *
 * Special case: class interpolations are translated into
 * v-class instead v-attr, so that it can work with user
 * provided v-class bindings.
 *
 * @param {String} name
 * @param {String} value
 * @param {Object} options
 * @return {Object}
 */

function collectAttrDirective(name, value, options) {
    var tokens = textParser.parse(value)
    var isClass = name === 'class'
    if (tokens) {
        var dirName = isClass ? 'class' : 'attr'
        var def = options.directives[dirName]
        var i = tokens.length
        var allOneTime = true
        while (i--) {
            var token = tokens[i]
            if (token.tag && !token.oneTime) {
                allOneTime = false
            }
        }
        return {
            def: def,
            _link: allOneTime ? function(vm, el) {
                el.setAttribute(name, vm.$interpolate(value))
            } : function(vm, el) {
                var exp = textParser.tokensToExp(tokens, vm)
                var desc = isClass ? dirParser.parse(exp)[0] : dirParser.parse(name + ':' + exp)[0]
                if (isClass) {
                    desc._rawClass = value
                }
                vm._bindDir(dirName, el, desc, def)
            }
        }
    }
}

/**
 * Directive priority sort comparator
 *
 * @param {Object} a
 * @param {Object} b
 */

function directiveComparator(a, b) {
    a = a.def.priority || 0
    b = b.def.priority || 0
    return a > b ? 1 : -1
}
