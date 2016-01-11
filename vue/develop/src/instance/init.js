var mergeOptions = require('../util').mergeOptions

/**
 * The main init sequence. This is called for every
 * instance, including ones that are created from extended
 * constructors.
 *
 * @param {Object} options - this options object should be
 *                           the result of merging class
 *                           options and the options passed
 *                           in to the constructor.
 */

exports._init = function(options) {

    options = options || {}

    this.$el = null
    this.$parent = options._parent
    this.$root = options._root || this
    this.$children = []
    this.$ = {} // child vm references
    this.$$ = {} // element references
    this._watchers = [] // all watchers as an array
    this._directives = [] // all directives 
    this._childCtors = {} // inherit:true constructors

    // a flag to avoid this being observed
    this._isVue = true

    // events bookkeeping
    this._events = {} // registered callbacks

    //避免不必要的深度遍历：
    //在有广播事件到来时，如果当前 vm 的 _eventsCount 为 0，
    //则不必向其子 vm 继续传播该事件
    this._eventsCount = {} // for $broadcast optimization
    this._eventCancelled = false // for event cancellation

    // fragment instance properties
    this._isFragment = false
    this._fragmentStart = // @type {CommentNode}
        this._fragmentEnd = null // @type {CommentNode}

    // lifecycle state
    this._isCompiled =
        this._isDestroyed =
        this._isReady =
        this._isAttached =
        this._isBeingDestroyed = false
    this._unlinkFn = null

    // context: the scope in which the component was used,
    // and the scope in which props and contents of this
    // instance should be compiled in.
    this._context =
        options._context ||
        options._parent

    // push self into parent / transclusion host
    if (this.$parent) {
        this.$parent.$children.push(this)
    }

    // props used in v-repeat diffing
    this._reused = false
    this._staggerOp = null

    // merge options.
    options = this.$options = mergeOptions(
        this.constructor.options,
        options,
        this
    )

    // initialize data as empty object.
    // it will be filled up in _initScope().
    // 
    // data = {
    //   __ob__ {
    //      dep
    //      parent 
    //      vms [vm合集]
    //   }
    //   
    //   属性：{
    //     set
    //     get
    //   }   
    // }
    // 
    this._data = {}

    // initialize data observation and scope inheritance.
    // 填充_data数据
    // 生成get/set
    this._initScope()

    // setup event system and option events.
    // event
    // watch
    this._initEvents()

    // call created hook
    this._callHook('created')

    // if `el` option is passed, start compilation.
    if (options.el) {
        // 递归遍历模板中的 DOM 节点并收集其中的指令，
        // 将其数据和这些指令所对应的 DOM 节点 “链接” 起来。
        // 一旦链接完毕，这些 DOM 节点就算是被 Vue 实例正式接管了。
        // 一个 DOM 节点只能被一个 Vue 实例管理，并且不能被多次编译。
        this.$mount(options.el)
    }
}
