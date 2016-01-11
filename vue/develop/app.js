var Vue = require('./src/vue.js');

var vm = new Vue({
	el:"#demo",
    data: {
        firstName : 'Foo',
        lastName  : 'Bar',
        message   :'jaja'
    },
    computed: {
        fullName: function() {
            return this.firstName + ' ' + this.lastName
        }
    },
    methods:{
        onDown:function(){
            this.firstName = "Aaron"
        },
        onUp:function(){
            this.lastName  = "慕课网"
        }
    }
})
  

// // Vue.config.debug = true;

// // require('./style.css');

// // var xtemplate = 
// // 	'<table>'+
// // 	'	<thead>'+
// // 	'		<th>姓名</th>'+
// // 	'		<th>价格</th>'+
// // 	'	</thead>'+
// // 	'	<tbody>'+
// // 	'		<tr>'+
// // 	'			<td>1</td>'+
// // 	'			<td>2</td>'+
// // 	'		</tr>'+
// // 	'	</tbody>'+
// // 	'</table>';


// // Vue.component('demo-grid', {
// // 	template:xtemplate
// // 	props:['data']
// // })


// // var app = new Vue({
// // 	el: '#demo',
// // 	data: {
// // 	    searchQuery: '',
// // 	    gridColumns: ['name', 'power'],
// // 	    gridData: [
// // 	      { name: 'Chuck Norris', power: Infinity },
// // 	      { name: 'Bruce Lee', power: 9000 },
// // 	      { name: 'Jacky Chang', power: 7000 },
// // 	      { name: 'Jet Li', power: 8000 }
// // 	    ]
// //    }
// // })
